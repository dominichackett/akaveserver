// Load environment variables from .env file

require('dotenv').config();
const ethers = require("ethers")
const express = require('express');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);
const archiver = require('archiver');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');

// Configuration
const API_BASE_URL = process.env.API_BASE_URL;
const PORT = process.env.PORT || 3001;
const TEMP_DIR = './temp';
const DEFAULT_BUCKET = 'bodyblueprintdao';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const DAO_ADDRESS = process.env.DAO_ADDRESS;
const DAO_ABI  = process.env.DAO_ABI;
DAO_STORAGE_ABI =process.env.DAO_STORAGE_ABI
DAO_STORAGE_ADDRESS = process.env.DAO_STORAGE_ADDRESS

const provider = new ethers.providers.JsonRpcProvider(process.env.rpc);
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

// Apply CORS middleware
app.use(cors({
  origin: '*', // Or specific origin like 'http://localhost:3000'
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
/**
 * Verify User is subscribed to the DAO to download data
 * @param {string} message   - Messaged that was signed
 * @param {string} signature - Signed message
 * @returns {Boolean} - Response from the DAO Contract
 */
async function isSubscribedToDAO(message,signature){
  let  recoveredAddress
  let isSubscribed
  try {

    const parsedMessage = JSON.parse(message)
    const signedDate = new Date(parsedMessage.date).getTime();
    const now = new Date().getTime()
    console.log(Math.round(now-signedDate)) 

    if(Math.round(now-signedDate) > 5 * 60 * 1000 ) //5 minutes

      {
        console.log(Math.round(now-signedDate)) 
        console.log("token expired")
        return false
      }

    const contract = new ethers.Contract(DAO_STORAGE_ADDRESS,DAO_STORAGE_ABI,provider)
    
    recoveredAddress = ethers.utils.verifyMessage(message,signature)
    console.log("Recovered Address: ",recoveredAddress)
  
    
     isSubscribed = await contract.isSubscribed(recoveredAddress);
     console.log(isSubscribed)
    return {isSubscribed,recoveredAddress}

  }catch(error)
  {
    console.log(error)
    return {isSubscribed,recoveredAddress}
  }
}


/**
 * Verify User is a member of the DAO
 * @param {string} message   - Messaged that was signed
 * @param {string} signature - Signed message
 * @returns {Boolean} - Response from the DAO Contract
 */
async function isDAOMember(message,signature){
  let  recoveredAddress
  let  isMember 
  try {

    const parsedMessage = JSON.parse(message)
    const signedDate = new Date(parsedMessage.date).getTime();
    const now = new Date().getTime()
    if(Math.round(now-signedDate) > 5 * 60 * 1000 )
      return false

    const contract = new ethers.Contract(DAO_ADDRESS,DAO_ABI,provider)

    recoveredAddress = ethers.utils.verifyMessage(message,signature)
    console.log("Recovered Address: ",recoveredAddress)
  
    
    isMember = await contract.isMember(recoveredAddress);
    return {isMember,recoveredAddress}

  }catch(error)
  {
    return {isMember,recoveredAddress}

  }
}


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
  const { bucketName,message,signature } = req.params;
  const tempFilePath = req.file.path;
  const originalFilename = req.file.originalname;
  
  try {
    const { isMember}= await isDAOMember(message,signature)
   // if(!isMember)
     // throw(new Error("You are not a DAO Member"));
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
      
      error: error.message
    });
  }
});

// Download file endpoint
app.get('/api/buckets/:bucketName/files/:fileName/download', async (req, res) => {
  const { bucketName, fileName,message,signature } = req.params;
  const { isMember}= await isDAOMember(message,signature)
    if(!isMember)
    throw(new Error("You are not a DAO Member"));
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


app.post('/api/getzippeddata', async (req, res) => {
  const { message, signature } = req.body;
  const bucketName = DEFAULT_BUCKET; // Using the default bucket (bodyblueprintdao)
  const requestId = uuidv4(); // Define requestId at the beginning
  const requestTempDir = path.join(TEMP_DIR, requestId);
  
  try {
    // Verify Subscription
      const {isSubscribed,recoveredAddress} = await  isSubscribedToDAO(message, signature);
      console.log(isSubscribed)
      console.log(recoveredAddress)
      if (!isSubscribed) {
        return res.status(403).json({
          message: 'Access denied: You don\'t have a paid subscription.',
          error: 'Authentication failed'
        });
      
    }
    
    // List all files in the bucket
    const response = await axios.get(`${API_BASE_URL}/buckets/${bucketName}/files`);
    
    // Log the response to understand its structure
    console.log('API Response Structure:', JSON.stringify(response.data, null, 2));
    
    // Extract files array - based on the specific response format shown
    let files = [];
    
    // The API returns { success: true, data: [ {files...} ] }
    if (response.data && response.data.success && Array.isArray(response.data.data)) {
      files = response.data.data;
    } else if (response.data && Array.isArray(response.data)) {
      files = response.data;
    } else if (response.data && Array.isArray(response.data.files)) {
      files = response.data.files;
    }
    
    console.log(`Found ${files.length} files to process`);
    
    if (!files.length) {
      return res.status(404).json({
        message: 'No files found in the bucket'
      });
    }
    
    // Create a unique temporary directory for this request
    fs.mkdirSync(requestTempDir, { recursive: true });
    
    // Set up the response as a zip file
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="bodyblueprintdao-files.zip"`);
    
    // Create a zip archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Compression level
    });
    
    // Pipe the archive to the response
    archive.pipe(res);
    
    // Error handling for the archive
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.end();
    });
    
    // Track downloaded files for cleanup
    const downloadedFiles = [];
    
    // Process each file individually instead of using map
    for (const file of files) {
      // Extract filename from file object, specifically looking for the "Name" property (capital N)
      const fileName = file.Name;
      
      if (!fileName) {
        console.warn('Skipping file with no identifiable name:', file);
        continue;
      }
      
      console.log(`Processing file: ${fileName}`);
      
      try {
        console.log(`Downloading file: ${fileName}`);
        
        // Download the file
        const fileStream = await downloadFileFromStorage(bucketName, fileName);
        const tempFilePath = path.join(requestTempDir, fileName);
        
        // Save the stream to a temporary file
        await pipeline(fileStream, fs.createWriteStream(tempFilePath));
        
        // Add the file to the archive
        archive.file(tempFilePath, { name: fileName });
        
        downloadedFiles.push(tempFilePath);
      } catch (error) {
        console.error(`Error downloading file ${fileName}:`, error.message);
        // Continue with other files even if one fails
      }
    }
    
    // Finalize the archive
    await archive.finalize();
    
    // Clean up the temporary files after response is sent
    res.on('finish', () => {
      // Delete all downloaded files
      downloadedFiles.forEach(filePath => {
        if (filePath && fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });
      
      // Remove the temporary directory
      if (fs.existsSync(requestTempDir)) {
        fs.rmdirSync(requestTempDir, { recursive: true });
      }
      
      console.log(`Cleaned up temporary files for request ${requestId}`);
    });
    
  } catch (error) {
    console.error('Get zipped data error:', error.message);
    
    // If headers haven't been sent yet, send an error response
    if (!res.headersSent) {
      res.status(error.response?.status || 500).json({
        message: 'Failed to get zipped data',
        error: error.response?.data || error.message
      });
    } else {
      // If headers were already sent, end the response
      res.end();
    }
    
    // Clean up any temporary directory created for this request
    if (fs.existsSync(requestTempDir)) {
      fs.rmdirSync(requestTempDir, { recursive: true });
    }
  }
});
// Start the server
app.listen(PORT, async () => {
  console.log(`File relay server running on port ${PORT}`);
  console.log(`Relaying to storage service at: ${API_BASE_URL}`);
  
  // Create the default bucket on startup
  await initializeDefaultBucket();
});