// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);

// Configuration
const API_BASE_URL = process.env.API_BASE_URL || 'http://storage-service-url';
const PORT = process.env.PORT || 3001;
const TEMP_DIR = './temp';
const DEFAULT_BUCKET = 'bodyblueprintdao';

// Create temp directory if it doesn't exist
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Configure multer for temporary file storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, TEMP_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

// Initialize Express app
const app = express();
app.use(express.json());

/**
 * Create a new bucket in the storage service
 * @param {string} bucketName - Name of the bucket to create
 * @returns {Promise<Object>} - Response from the storage service
 */
async function createBucket(bucketName) {
  try {
    const response = await axios.post(`${API_BASE_URL}/buckets`, {
      bucketName: bucketName
    });
    return response.data;
  } catch (error) {
    console.error(`Error creating bucket ${bucketName}:`, error.message);
    throw error;
  }
}

/**
 * Upload a file to the storage service
 * @param {string} bucketName - Name of the bucket
 * @param {string} filePath - Path to the file
 * @returns {Promise<Object>} - Response from the storage service
 */
async function uploadFileToStorage(bucketName, filePath, originalFilename) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), originalFilename);
  
  try {
    const response = await axios.post(`${API_BASE_URL}/buckets/${bucketName}/files`, form, {
      headers: form.getHeaders(),
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

/**
 * Download a file from the storage service
 * @param {string} bucketName - Name of the bucket
 * @param {string} fileName - Name of the file to download
 * @returns {Promise<stream.Readable>} - Stream of the file data
 */
async function downloadFileFromStorage(bucketName, fileName) {
  try {
    const response = await axios.get(`${API_BASE_URL}/buckets/${bucketName}/files/${fileName}/download`, {
      responseType: 'stream',
    });
    return response.data;
  } catch (error) {
    throw error;
  }
}

// Routes

// Create bucket endpoint
app.post('/api/buckets', async (req, res) => {
  const { bucketName } = req.body;
  
  if (!bucketName) {
    return res.status(400).json({
      message: 'bucketName is required'
    });
  }
  
  try {
    const result = await createBucket(bucketName);
    res.status(201).json(result);
  } catch (error) {
    console.error('Bucket creation error:', error.message);
    res.status(error.response?.status || 500).json({
      message: 'Failed to create bucket',
      error: error.response?.data || error.message
    });
  }
});

// Upload file endpoint
app.post('/api/buckets/:bucketName/upload', upload.single('file'), async (req, res) => {
  const { bucketName } = req.params;
  const tempFilePath = req.file.path;
  const originalFilename = req.file.originalname;
  
  try {
    const result = await uploadFileToStorage(bucketName, tempFilePath, originalFilename);
    
    // Clean up temp file
    fs.unlinkSync(tempFilePath);
    
    res.status(200).json({
      message: 'File uploaded successfully',
      fileInfo: result
    });
  } catch (error) {
    // Clean up temp file in case of error
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    
    console.error('Upload error:', error.message);
    res.status(error.response?.status || 500).json({
      message: 'Failed to upload file',
      error: error.response?.data || error.message
    });
  }
});

// Download file endpoint
app.get('/api/buckets/:bucketName/files/:fileName/download', async (req, res) => {
  const { bucketName, fileName } = req.params;
  
  try {
    const fileStream = await downloadFileFromStorage(bucketName, fileName);
    
    // Set appropriate headers
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    
    // Pipe the file stream to the response
    await pipeline(fileStream, res);
  } catch (error) {
    console.error('Download error:', error.message);
    res.status(error.response?.status || 500).json({
      message: 'Failed to download file',
      error: error.response?.data || error.message
    });
  }
});

// List files in a bucket (optional, depends on if storage service supports this)
app.get('/api/buckets/:bucketName/files', async (req, res) => {
  const { bucketName } = req.params;
  
  try {
    const response = await axios.get(`${API_BASE_URL}/buckets/${bucketName}/files`);
    res.status(200).json(response.data);
  } catch (error) {
    console.error('List files error:', error.message);
    res.status(error.response?.status || 500).json({
      message: 'Failed to list files',
      error: error.response?.data || error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Create default bucket function
async function initializeDefaultBucket() {
  try {
    const result = await createBucket(DEFAULT_BUCKET);
    console.log(`Default bucket "${DEFAULT_BUCKET}" created successfully:`, result);
  } catch (error) {
    // Check if the error is because the bucket already exists (you might need to adjust this based on your API's error response)
    if (error.response && error.response.data && error.response.data.message && 
        error.response.data.message.includes('already exists')) {
      console.log(`Default bucket "${DEFAULT_BUCKET}" already exists.`);
    } else {
      console.error(`Failed to create default bucket "${DEFAULT_BUCKET}":`, 
        error.response ? error.response.data : error.message);
    }
  }
}

// Start the server
app.listen(PORT, async () => {
  console.log(`File relay server running on port ${PORT}`);
  console.log(`Relaying to storage service at: ${API_BASE_URL}`);
  
  // Create the default bucket on startup
  await initializeDefaultBucket();
});