# Body Blueprint DAO File Relay Server

A secure Node.js server that relays file uploads and downloads between the Body Blueprint mobile app and AKAVE storage service. This API enables DAO members to securely share and manage fitness data through the Body Blueprint DAO.

## Features

- Secure file uploads with DAO membership verification
- File downloads restricted to verified DAO members
- Bulk data retrieval via zip download
- Built-in bucket management
- Ethereum wallet integration for authentication

## Prerequisites

- Node.js 14 or higher
- npm or yarn
- Environment variables configured (see below)

## Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file with the following variables:

```
API_BASE_URL=<AKAVE_STORAGE_SERVICE_URL>
PORT=3001
PRIVATE_KEY=<ETHEREUM_PRIVATE_KEY>
DAO_ADDRESS=<DAO_CONTRACT_ADDRESS>
DAO_ABI=<DAO_CONTRACT_ABI>
```

4. Start the server:

```bash
npm start
```

## API Authentication

Most endpoints require DAO membership verification through Ethereum signature authentication:

1. Client creates a message with the format:
```json
{
  "message": "Body Blue Print DAO",
  "date": "2025-04-12T12:34:56.789Z"
}
```

2. Client signs this message with their Ethereum wallet
3. Both the original message and signature are passed to the API endpoints

## API Endpoints

### Create a Bucket

```
POST /api/buckets
```

**Request Body:**
```json
{
  "bucketName": "your-bucket-name"
}
```

**Response (201):**
```json
{
  "success": true,
  "bucketName": "your-bucket-name"
}
```

### Upload a File

```
POST /api/buckets/:bucketName/upload
```

**Parameters:**
- `bucketName`: Name of the target bucket
- `message`: JSON stringified authentication message
- `signature`: Ethereum signature of the message

**Request:**
- Content-Type: multipart/form-data
- Body: Include file with field name "file"

**Example with curl:**
```bash
curl -X POST \
  -F "file=@/path/to/file.jpg" \
  -F "message={\"message\":\"Body Blue Print DAO\",\"date\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")\"}}" \
  -F "signature=0x1234...5678" \
  http://localhost:3001/api/buckets/bodyblueprintdao/upload
```

**Response (200):**
```json
{
  "message": "File uploaded successfully",
  "fileInfo": {
    "filename": "file.jpg",
    "size": 1024,
    "contentType": "image/jpeg"
  }
}
```

### Download a File

```
GET /api/buckets/:bucketName/files/:fileName/download
```

**Parameters:**
- `bucketName`: Name of the bucket
- `fileName`: Name of the file to download
- `message`: JSON stringified authentication message
- `signature`: Ethereum signature of the message

**Example with curl:**
```bash
curl -OJ \
  "http://localhost:3001/api/buckets/bodyblueprintdao/files/fitness_data.json/download?message={\"message\":\"Body Blue Print DAO\",\"date\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")\"}}&signature=0x1234...5678"
```

**Response:**
- Content-Type: application/octet-stream
- Content-Disposition: attachment; filename="fitness_data.json"
- Body: File data stream

### List Files in a Bucket

```
GET /api/buckets/:bucketName/files
```

**Parameters:**
- `bucketName`: Name of the bucket

**Example with curl:**
```bash
curl "http://localhost:3001/api/buckets/bodyblueprintdao/files"
```

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "Name": "file1.jpg",
      "Size": 1024,
      "LastModified": "2025-04-12T10:00:00Z"
    },
    {
      "Name": "file2.json",
      "Size": 512,
      "LastModified": "2025-04-11T15:30:00Z"
    }
  ]
}
```

### Download All Files as Zip

```
GET /api/getzippeddata
```

**Query Parameters:**
- `message`: JSON stringified authentication message
- `signature`: Ethereum signature of the message

**Example with curl:**
```bash
curl -o data.zip \
  "http://localhost:3001/api/getzippeddata?message={\"message\":\"Body Blue Print DAO\",\"date\":\"$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")\"}}&signature=0x1234...5678"
```

**Response:**
- Content-Type: application/zip
- Content-Disposition: attachment; filename="bodyblueprintdao-files.zip"
- Body: Zip archive containing all files in the default bucket

### Health Check

```
GET /health
```

**Response (200):**
```json
{
  "status": "OK"
}
```

## Error Handling

All endpoints return appropriate HTTP status codes:

- 200/201: Success
- 400: Bad request (missing parameters)
- 403: Authentication failed (not a DAO member)
- 404: Resource not found
- 500: Server error

Error responses include a JSON body with:
```json
{
  "message": "Error description",
  "error": "Detailed error information"
}
```

## Mobile App Integration

The Body Blueprint EXPO mobile app can integrate with this API by:

1. Generating and signing authentication messages using the user's Ethereum wallet
2. Using the appropriate endpoints for uploading fitness data
3. Retrieving shared DAO data using the download endpoints

## Security Considerations

- Authentication messages should include a recent timestamp
- The server validates that signatures are recent (within 5ms of current time)
- Only verified DAO members can upload and download files
- Files are temporarily stored and securely cleaned up after processing