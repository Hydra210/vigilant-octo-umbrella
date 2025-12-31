FROM node:16

# Install FFmpeg
RUN apt-get update && apt-get install -y ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
```

### **Step 2: Delete or rename nixpacks.toml**

Since it's not working, either:
- Delete `nixpacks.toml` from your repo, OR
- Rename it to `nixpacks.toml.backup`

### **Step 3: Commit and push**

Railway will automatically detect the Dockerfile and use it instead of Railpack.

### **Step 4: Check the new build logs**

You should now see:
```
FROM node:16
...
RUN apt-get update && apt-get install -y ffmpeg
...
