import React from 'react';

export function Modal({ title, onClose, children, footer, width = '500px' }) {
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" style={{ minWidth: width, maxWidth: '95vw' }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, onConfirm, onCancel, danger }) {
  return (
    <Modal 
      title={title || '确认操作'}
      onClose={onCancel}
      footer={
        <>
          <button className="btn btn-outline" onClick={onCancel}>取消</button>
          <button 
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} 
            onClick={onConfirm}
          >
            确认
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{message}</p>
    </Modal>
  );
}
