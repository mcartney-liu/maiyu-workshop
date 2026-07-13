import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { agentAPI, convAPI, createSSEChat, createSSEGenerate } from '../../api';

export default function ChatPage() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [agent, setAgent] = useState(null);
  const [conv, setConv] = useState(null);
  const [convList, setConvList] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [pluginResults, setPluginResults] = useState(null);
  const [citations, setCitations] = useState([]);
  const [variables, setVariables] = useState({});
  const [varsFilled, setVarsFilled] = useState(false);
  const [generateResult, setGenerateResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const pendingQ = useRef(searchParams.get('q'));
  const autoHandled = useRef(false);

  useEffect(() => {
    loadAgent();
  }, [agentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadAgent = async () => {
    try {
      const res = await agentAPI.get(agentId);
      const a = res.data;
      setAgent(a);
      
      // Init variables
      const vars = {};
      (a.config.variables || []).forEach(v => {
        vars[v.name] = v.defaultValue || '';
      });
      setVariables(vars);
      
      // If no variables or all have defaults, auto-fill
      const hasRequiredVars = (a.config.variables || []).some(v => v.required && !v.defaultValue);
      setVarsFilled(!hasRequiredVars);
      
      // Load conversation list
      loadConvList(a);
    } catch (e) {
      console.error(e);
    }
  };

  const loadConvList = async (a) => {
    if (a.type !== 'chat') return;
    try {
      const res = await convAPI.list(agentId);
      const list = res.data.conversations || [];
      setConvList(list);
    } catch (e) {}
  };

  const startNewConversation = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await convAPI.create(agentId, { variables });
      const newConv = res.data;
      setConv(newConv);
      setMessages(newConv.messages || []);
      
      const res2 = await convAPI.list(agentId);
      setConvList(res2.data.conversations || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadConversation = async (convId) => {
    try {
      const res = await convAPI.get(agentId, convId);
      setConv(res.data);
      setMessages(res.data.messages || []);
    } catch (e) {}
  };

  const sendMessage = useCallback(async (overrideContent) => {
    // 防御：避免把 onClick/onSubmit 误传的事件对象当成消息内容导致 .trim() 崩溃
    if (overrideContent != null && typeof overrideContent !== 'string') return;
    const msgContent = (overrideContent != null ? overrideContent : input).trim();
    if (!msgContent || streaming) return;
    if (!conv) {
      await startNewConversation();
      return;
    }
    
    setInput('');
    
    // Optimistic UI
    const tempUserMsg = {
      id: 'temp_user_' + Date.now(),
      role: 'user',
      content: msgContent,
      createdAt: new Date().toISOString()
    };
    
    const tempAssistantMsg = {
      id: 'temp_assistant_' + Date.now(),
      role: 'assistant',
      content: '',
      loading: true,
      createdAt: new Date().toISOString()
    };
    
    setMessages(prev => [...prev, tempUserMsg, tempAssistantMsg]);
    setStreaming(true);
    setPluginResults(null);
    setCitations([]);
    
    let accumulated = '';
    
    const cleanup = createSSEChat(
      agentId,
      conv.id,
      msgContent,
      variables,
      (chunk) => {
        accumulated += chunk;
        setMessages(prev => prev.map(m => 
          m.id === tempAssistantMsg.id 
            ? { ...m, content: accumulated, loading: false }
            : m
        ));
      },
      (messageId, citations) => {
        setStreaming(false);
        if (citations && citations.length > 0) setCitations(citations);
        setMessages(prev => prev.map(m => 
          m.id === tempAssistantMsg.id 
            ? { ...m, loading: false, id: messageId || m.id }
            : m
        ));
      },
      (error) => {
        setStreaming(false);
        setMessages(prev => prev.map(m => 
          m.id === tempAssistantMsg.id 
            ? { ...m, content: `❌ ${error}`, loading: false, error: true }
            : m
        ));
      },
      (results) => {
        setPluginResults(results);
      }
    );
    
    abortRef.current = cleanup;
  }, [input, streaming, conv, agentId, variables]);

  // 从首页带问题进入（?q=）：自动建会话并发送；已有会话直接发送；生成型仅预填
  useEffect(() => {
    if (autoHandled.current || !pendingQ.current || !agent) return;
    const q = pendingQ.current;
    if (agent.type !== 'chat') {
      autoHandled.current = true;
      setInput(q);
      inputRef.current?.focus();
      return;
    }
    if (conv) {
      autoHandled.current = true;
      sendMessage(q);
    } else {
      // 还没有会话，先建一个；建完后 conv 变化会再次触发本 effect 并自动发送
      startNewConversation();
    }
  }, [agent, conv, sendMessage]);

  const handleGenerate = () => {
    setIsGenerating(true);
    setGenerateResult('');
    
    let accumulated = '';
    
    createSSEGenerate(
      agentId,
      variables,
      (chunk) => {
        accumulated += chunk;
        setGenerateResult(accumulated);
      },
      () => setIsGenerating(false),
      (err) => {
        setIsGenerating(false);
        setGenerateResult(`❌ ${err}`);
      }
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const exportChat = () => {
    if (!messages.length) return;
    const lines = [`# ${agent.name} 对话记录`, ''];
    messages.forEach(m => {
      lines.push(`**${m.role === 'user' ? '用户' : '助手'}** (${new Date(m.createdAt).toLocaleString()})`);
      lines.push(m.content || '');
      lines.push('');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agent.name || '对话'}-对话记录.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!agent) {
    return (
      <div style={{ display: 'flex', height: '100%', background: '#f8fafc' }}>
        <div className="skeleton" style={{ width: 240, flexShrink: 0, borderRadius: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20 }}>
          <div className="skeleton skeleton-row" style={{ marginBottom: 20 }}>
            <div className="skeleton skeleton-avatar" />
            <div style={{ flex: 1 }}>
              <div className="skeleton skeleton-line long" style={{ width: '30%' }} />
              <div className="skeleton skeleton-line short" style={{ width: '20%' }} />
            </div>
          </div>
          <div className="skeleton skeleton-card" style={{ marginBottom: 16 }}>
            <div className="skeleton skeleton-line long" />
            <div className="skeleton skeleton-line long" />
            <div className="skeleton skeleton-line short" />
          </div>
          <div className="skeleton skeleton-card" style={{ marginBottom: 16 }}>
            <div className="skeleton skeleton-line long" />
            <div className="skeleton skeleton-line short" />
          </div>
        </div>
      </div>
    );
  }

  const isChat = agent.type === 'chat';
  const requiredVars = (agent.config.variables || []).filter(v => v.required);
  const hasVars = (agent.config.variables || []).length > 0;
  
  return (
    <div style={{ display: 'flex', height: '100%', background: '#f8fafc' }}>
      {/* Conversation sidebar (chat type only) */}
      {isChat && sidebarOpen && (
        <aside style={{
          width: 240,
          background: 'white',
          borderRight: '1px solid #e2e8f0',
          display: 'flex',
          flexDirection: 'column',
          flexShrink: 0
        }}>
          <div style={{ padding: '16px 12px', borderBottom: '1px solid #e2e8f0' }}>
            <button className="btn btn-accent" style={{ width: '100%' }} onClick={startNewConversation}>
              + 新建对话
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>
            {convList.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                暂无对话记录
              </div>
            ) : (
              convList.map(c => (
                <div
                  key={c.id}
                  onClick={() => loadConversation(c.id)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: conv?.id === c.id ? '#E8F2FF' : 'transparent',
                    color: conv?.id === c.id ? '#2A83FF' : '#374151',
                    fontSize: 13,
                    marginBottom: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s'
                  }}
                >
                  💬 {c.title || '新对话'}
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Chat main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Agent header */}
        <div style={{
          padding: '14px 20px',
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0
        }}>
          <button onClick={() => navigate('/')} style={{ 
            background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: '0 4px',
            color: '#64748b', display: 'flex', alignItems: 'center'
          }}>←</button>
          
          {isChat && (
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
              background: '#f1f5f9', border: 'none', cursor: 'pointer',
              padding: '5px 8px', borderRadius: 6, color: '#64748b', fontSize: 13
            }}>
              {sidebarOpen ? '◀' : '▶'}
            </button>
          )}
          
          <div style={{ fontSize: 28 }}>{agent.avatar || '🤖'}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{agent.name}</div>
            {agent.description && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>{agent.description}</div>
            )}
          </div>
          <div style={{ marginLeft: 8 }}>
            <span className={`tag ${isChat ? 'tag-primary' : 'tag-success'}`} style={{ fontSize: 11 }}>
              {isChat ? '💬 智能对话' : '⚡ 内容生成'}
            </span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={exportChat} disabled={!messages.length} title="导出当前对话">
              ⬇️ 导出
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Messages / Generate area */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {isChat ? (
              <>
                {/* Messages */}
                <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
                  {!conv ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>
                      <div style={{ fontSize: 56, marginBottom: 16 }}>{agent.avatar || '🤖'}</div>
                      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{agent.name}</h2>
                      {agent.config.greeting && (
                        <div style={{
                          background: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          padding: '16px 20px',
                          maxWidth: 480,
                          textAlign: 'center',
                          color: '#374151',
                          marginBottom: 24
                        }}>
                          {agent.config.greeting}
                        </div>
                      )}
                      {(agent.config.suggestedQuestions || []).filter(q => q).length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 560 }}>
                          {agent.config.suggestedQuestions.filter(q => q).map((q, i) => (
                            <button
                              key={i}
                              onClick={() => { setInput(q); startNewConversation(); }}
                              style={{
                                background: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: 20,
                                padding: '8px 16px',
                                fontSize: 13,
                                color: '#2A83FF',
                                cursor: 'pointer'
                              }}
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      )}
                      <button className="btn btn-accent" style={{ marginTop: 24 }} onClick={startNewConversation}>
                        开始对话
                      </button>
                    </div>
                  ) : (
                    <>
                      {messages.map((msg, i) => {
                        const isLastAssistant = msg.role === 'assistant' && i === messages.length - 1;
                        return (
                          <MessageBubble
                            key={msg.id}
                            message={msg}
                            agent={agent}
                            streaming={isLastAssistant && streaming && !msg.loading}
                          />
                        );
                      })}
                      <div ref={messagesEndRef} />
                      {citations.length > 0 && (
                        <div style={{
                          margin: '10px 0',
                          padding: '12px 16px',
                          background: '#E8F2FF',
                          borderRadius: 10,
                          border: '1px solid #9FCBFF',
                          fontSize: 12
                        }}>
                          <div style={{ fontWeight: 600, color: '#2A83FF', marginBottom: 6 }}>📚 参考来源</div>
                          {citations.map((c, i) => (
                            <div key={i} style={{ display: 'flex', gap: 8, padding: '4px 0', alignItems: 'flex-start' }}>
                              <span style={{ color: '#2A83FF', fontWeight: 600, flexShrink: 0 }}>[{i + 1}]</span>
                              <div>
                                <div style={{ color: '#374151', fontWeight: 500 }}>{c.source}</div>
                                <div style={{ color: '#94a3b8' }}>{c.snippet}</div>
                                <span style={{ color: '#2A83FF', fontSize: 11 }}>
                                  相关度: {(c.score * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
                
                {/* Plugin execution status */}
                {pluginResults && pluginResults.length > 0 && (
                  <div style={{
                    padding: '8px 20px',
                    background: '#f8fafc',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center'
                  }}>
                    <span style={{ fontSize: 12, color: '#64748b', marginRight: 4 }}>🔌 插件:</span>
                    {pluginResults.map((r, i) => (
                      <span key={i} style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 4,
                        background: r.success ? '#ecfdf5' : '#fef2f2',
                        color: r.success ? '#059669' : '#dc2626',
                        border: `1px solid ${r.success ? '#a7f3d0' : '#fecaca'}`
                      }}>
                        {r.success ? '✅' : '❌'} {r.pluginName}
                        {r.elapsed != null && <span style={{ marginLeft: 4, opacity: 0.7 }}>{r.elapsed}ms</span>}
                      </span>
                    ))}
                  </div>
                )}
                
                {/* Suggested questions (always available while in conversation) */}
                {conv && (agent.config.suggestedQuestions || []).filter(q => q).length > 0 && (
                  <div style={{ padding: '0 20px 8px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#94a3b8', flexShrink: 0 }}>试试：</span>
                    {(agent.config.suggestedQuestions).filter(q => q).slice(0, 4).map((q, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(q)}
                        style={{
                          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16,
                          padding: '5px 12px', fontSize: 12, color: '#2A83FF', cursor: 'pointer'
                        }}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input area */}
                {conv && (
                  <div style={{
                    padding: '16px 20px',
                    background: 'white',
                    borderTop: '1px solid #e2e8f0'
                  }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                      <textarea
                        ref={inputRef}
                        className="form-textarea"
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`有问题尽管问 ${agent.name}…（Enter 发送）`}
                        rows={2}
                        style={{ flex: 1, resize: 'none', borderRadius: 10 }}
                        disabled={streaming}
                      />
                      <button
                        className="btn btn-accent"
                        onClick={() => sendMessage()}
                        disabled={!input.trim() || streaming}
                        style={{ alignSelf: 'flex-end', minWidth: 72 }}
                      >
                        {streaming ? <span className="spinner spinner-sm" /> : '发送'}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
                      Enter 发送 · Shift+Enter 换行
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Generate type */
              <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
                {agent.config.greeting && (
                  <div style={{
                    background: '#E8F2FF',
                    borderRadius: 10,
                    padding: '14px 18px',
                    marginBottom: 20,
                    color: '#374151',
                    borderLeft: '3px solid #2A83FF'
                  }}>
                    {agent.config.greeting}
                  </div>
                )}
                
                {generateResult && (
                  <div style={{
                    background: 'white',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    padding: '20px',
                    marginBottom: 20
                  }}>
                    <div style={{ marginBottom: 10, fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>生成结果</div>
                    <div className="prose">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{generateResult}</ReactMarkdown>
                    </div>
                    {isGenerating && <span style={{ animation: 'blink 1s infinite' }}>▌</span>}
                  </div>
                )}
                
                <button
                  className="btn btn-accent btn-lg"
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  {isGenerating ? <><span className="spinner spinner-sm" /> 生成中...</> : '⚡ 立即生成'}
                </button>
              </div>
            )}
          </div>

          {/* Variable panel (right side) */}
          {hasVars && (
            <div style={{
              width: 280,
              background: 'white',
              borderLeft: '1px solid #e2e8f0',
              padding: '20px',
              overflow: 'auto',
              flexShrink: 0
            }}>
              <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 15 }}>⚙️ 配置参数</div>
              {(agent.config.variables || []).map(v => (
                <div key={v.name} style={{ marginBottom: 14 }}>
                  <label className="form-label">
                    {v.label || v.name}
                    {v.required && <span style={{ color: '#ef4444', marginLeft: 3 }}>*</span>}
                  </label>
                  {v.style === 'select' ? (
                    <select
                      className="form-select"
                      value={variables[v.name] || ''}
                      onChange={e => setVariables(prev => ({ ...prev, [v.name]: e.target.value }))}
                    >
                      <option value="">请选择</option>
                      {(v.options || []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : v.style === 'paragraph' ? (
                    <textarea
                      className="form-textarea"
                      rows={3}
                      value={variables[v.name] || ''}
                      onChange={e => setVariables(prev => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={v.placeholder || `请输入${v.label || v.name}`}
                      maxLength={v.maxLength}
                    />
                  ) : (
                    <input
                      className="form-input"
                      value={variables[v.name] || ''}
                      onChange={e => setVariables(prev => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={v.placeholder || `请输入${v.label || v.name}`}
                      maxLength={v.maxLength}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 检测消息内容是否为已知错误，返回友好提示
function friendlyError(content) {
  if (!content || typeof content !== 'string') return null;
  const c = content.trim();
  if (c === '[空回复]' || c === '空回复') {
    return { icon: '🤔', msg: '模型没有返回内容', hint: '可能是问题太模糊或知识库中没有相关内容，试试换个问法。' };
  }
  if (c.startsWith('[解析失败') || c.includes('Excel解析失败')) {
    return { icon: '📄', msg: '文档解析遇到问题', hint: '请检查文件格式是否正确，或重新上传一份。Excel 需为 .xlsx 格式。' };
  }
  if (c.startsWith('[错误: LLM请求超时') || c.includes('LLM请求超时')) {
    return { icon: '⏱️', msg: '回复超时了', hint: '问题可能太复杂或知识库内容过多。试试缩小问题范围，或减少知识库文档数量。' };
  }
  if (c.startsWith('[LLM调用失败')) {
    return { icon: '🔌', msg: '模型调用失败', hint: '可能是 API Key 失效或网络问题。请到「模型管理」检查配置，然后重试。' };
  }
  if (c.startsWith('❌')) {
    return { icon: '⚠️', msg: c.replace(/^❌\s*/, ''), hint: '请稍后重试，如果持续出现请检查智能体配置。' };
  }
  return null;
}

function MessageBubble({ message, agent, streaming }) {
  const isUser = message.role === 'user';
  const errInfo = !isUser && !message.loading ? friendlyError(message.content) : null;
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {}
      document.body.removeChild(ta);
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: isUser ? 'row-reverse' : 'row',
      gap: 12,
      marginBottom: 20,
      alignItems: 'flex-start'
    }}>
      {/* Avatar */}
      <div style={{
        width: 38,
        height: 38,
        borderRadius: '50%',
        background: isUser 
          ? 'linear-gradient(135deg, #2A83FF, #1F6AE0)' 
          : 'linear-gradient(135deg, #E8F2FF, #CFE4FF)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 18,
        flexShrink: 0,
        boxShadow: isUser ? '0 2px 8px rgba(42,131,255,0.25)' : 'none'
      }}>
        {isUser ? '👤' : (agent?.avatar || '🤖')}
      </div>
      
      {/* Bubble */}
      <div style={{
        maxWidth: '72%',
        background: isUser ? 'linear-gradient(135deg, #2A83FF, #1F6AE0)' : 'white',
        color: isUser ? 'white' : '#1e293b',
        borderRadius: isUser ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
        padding: isUser ? '13px 17px' : '13px 40px 13px 17px',
        boxShadow: isUser ? '0 2px 12px rgba(42,131,255,0.2)' : '0 1px 4px rgba(0,0,0,0.06)',
        border: isUser ? 'none' : '1px solid #edf0f5',
        position: 'relative'
      }}>
        {message.loading ? (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center', padding: '4px 0' }}>
            <span style={{ animation: 'bounce 0.6s infinite', animationDelay: '0s', display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#2A83FF', opacity: 0.6 }} />
            <span style={{ animation: 'bounce 0.6s infinite', animationDelay: '0.2s', display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#2A83FF', opacity: 0.6 }} />
            <span style={{ animation: 'bounce 0.6s infinite', animationDelay: '0.4s', display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#2A83FF', opacity: 0.6 }} />
          </div>
        ) : errInfo ? (
          <div className="friendly-error">
            <div><span className="err-icon">{errInfo.icon}</span>{errInfo.msg}</div>
            <div className="err-hint">💡 {errInfo.hint}</div>
          </div>
        ) : isUser ? (
          <p style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap', margin: 0 }}>{message.content}</p>
        ) : (
          <div className="prose" style={{ fontSize: 14 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            {streaming && <span className="stream-cursor" />}
          </div>
        )}
        {!isUser && !message.loading && !errInfo && (
          <button
            onClick={() => handleCopy(message.content)}
            title="复制回复"
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'rgba(255,255,255,0.95)', border: '1px solid #e2e8f0',
              borderRadius: 6, width: 26, height: 26, fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              opacity: copied ? 1 : 0.5, transition: 'opacity 0.15s'
            }}
          >
            {copied ? '✓' : '📋'}
          </button>
        )}
      </div>
    </div>
  );
}
