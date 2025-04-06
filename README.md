# File Relay Server

A Node.js server that acts as a relay for file uploads and downloads to AKAVE.
This works with the body blue print EXPO mobile app.
It allows users to upload their fitness data to be shared and managed by the Body Blue Print DAO

## Features

- Upload files to a remote storage service
- Download files from a remote storage service
- Simple API for file management
- Temporary file handling

## Prerequisites

- Node.js 14 or higher
- npm or yarn

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Configure environment variables:

```bash
export API_BASE_URL=http://your-storage-service-url
export PORT=3000
```

## Usage

### Start the server

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

### API Endpoints

#### Upload a file

```
POST /api/buckets/:bucketName/upload
```

- Request: Multipart form with a `file` field
- Response: JSON with upload result

Example with curl:
```bash
curl -X POST -F "file=@/path/to/localfile.txt" http://localhost:3000/api/buckets/myBucket/upload
```

#### Download a file

```
GET /api/buckets/:bucketName/files/:fileName/download
```

- Response: File download

Example with curl:
```bash
curl -O -J http://localhost:3000/api/buckets/myBucket/files/example.txt/download
```

#### List files in a bucket

```
GET /api/buckets/:bucketName/files
```

- Response: JSON list of files

Example with curl:
```bash
curl http://localhost:3000/api/buckets/myBucket/files
```

## How It Works

1. For uploads, the server temporarily stores the uploaded file, then forwards it to the storage service
2. For downloads, the server streams the file from the storage service directly to the client
3. All temporary files are cleaned up after the request completes

## Error Handling

The server provides proper error handling and cleanup of temporary files in case of failures. 
