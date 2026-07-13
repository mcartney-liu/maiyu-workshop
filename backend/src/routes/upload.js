const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR } = require('../utils/storage');

const uploadsDir = path.join(DATA_DIR, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.txt', '.pdf', '.docx', '.doc', '.md', '.csv', '.json', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件格式: ${ext}`));
    }
  }
});

// Python parser script path
const PARSE_SCRIPT = path.join(__dirname, '../../scripts/parse_doc.py');
const PYTHON_BIN = process.env.PYTHON_PATH || (() => {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.workbuddy', 'binaries', 'python', 'versions', '3.13.12', 'python.exe');
})();

function parseWithPython(filePath, fileType) {
  try {
    const result = execFileSync(PYTHON_BIN, ['-X', 'utf8', PARSE_SCRIPT, filePath, fileType], {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024
    });
    return result.trim();
  } catch (err) {
    return `[解析失败: ${err.message}]`;
  }
}

// POST /api/upload/document - 上传文档并提取文本
router.post('/document', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  
  // Fix Chinese filename encoding: multer on Windows decodes UTF-8 bytes as latin1
  let { originalname, filename, path: filePath } = req.file;
  originalname = Buffer.from(originalname, 'latin1').toString('utf8');
  const ext = path.extname(originalname).toLowerCase();
  const fileType = ext.slice(1);
  
  let content = '';
  
  try {
    if (ext === '.txt' || ext === '.md') {
      content = fs.readFileSync(filePath, 'utf-8');
    } else if (ext === '.csv') {
      const raw = fs.readFileSync(filePath, 'utf-8');
      content = raw;
    } else if (ext === '.json') {
      const raw = fs.readFileSync(filePath, 'utf-8');
      try {
        const parsed = JSON.parse(raw);
        content = JSON.stringify(parsed, null, 2);
      } catch {
        content = raw;
      }
    } else if (ext === '.pdf') {
      content = parseWithPython(filePath, 'pdf');
      if (!content || content.startsWith('[')) {
        // Fallback: just store the file path
        content = `[PDF已上传: ${originalname}]\n\n${content || ''}`;
      }
    } else if (ext === '.docx' || ext === '.doc') {
      content = parseWithPython(filePath, 'docx');
      if (!content || content.startsWith('[')) {
        content = `[文档已上传: ${originalname}]\n\n${content || ''}`;
      }
    } else if (ext === '.xlsx' || ext === '.xls') {
      content = parseWithPython(filePath, 'xlsx');
      if (!content || content.startsWith('[')) {
        content = `[Excel已上传: ${originalname}]\n\n${content || ''}`;
      }
    } else {
      content = `[文件已上传: ${originalname}]`;
    }
    
    res.json({
      success: true,
      fileName: originalname,
      storedName: filename,
      content,
      size: req.file.size,
      type: fileType
    });
  } catch (err) {
    res.status(500).json({ error: `文件处理失败: ${err.message}` });
  }
});

module.exports = router;
