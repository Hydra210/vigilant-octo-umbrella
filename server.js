// Audio Analysis API Server for Roblox Visualizer
// Install dependencies: npm install express axios form-data node-fetch@2 fluent-ffmpeg

const express = require('express');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3000;

// In-memory cache (use Redis in production)
const cache = new Map();

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
});

app.use(express.json());

// Health check
app.get('/', (req, res) => {
    res.json({
        status: 'online',
        message: 'Roblox Audio Analysis API',
        endpoints: {
            analyze: '/api/analyze/:assetId',
            cache: '/api/cache',
            health: '/'
        }
    });
});

// Main analysis endpoint
app.get('/api/analyze/:assetId', async (req, res) => {
    const assetId = req.params.assetId;
    
    console.log(`[REQUEST] Analyzing asset ID: ${assetId}`);
    
    // Check cache first
    if (cache.has(assetId)) {
        console.log(`[CACHE HIT] Returning cached data for ${assetId}`);
        return res.json({
            success: true,
            cached: true,
            data: cache.get(assetId)
        });
    }
    
    try {
        // Step 1: Download audio from Roblox
        console.log(`[DOWNLOAD] Fetching audio from Roblox...`);
        const audioPath = await downloadRobloxAudio(assetId);
        
        // Step 2: Analyze frequencies
        console.log(`[ANALYZE] Processing audio file...`);
        const frequencyData = await analyzeAudio(audioPath);
        
        // Step 3: Cache result
        cache.set(assetId, frequencyData);
        console.log(`[CACHE] Stored data for ${assetId}`);
        
        // Step 4: Cleanup temp file
        fs.unlinkSync(audioPath);
        
        // Return data
        res.json({
            success: true,
            cached: false,
            data: frequencyData
        });
        
    } catch (error) {
        console.error(`[ERROR] ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Cache status endpoint
app.get('/api/cache', (req, res) => {
    res.json({
        cached_songs: cache.size,
        asset_ids: Array.from(cache.keys())
    });
});

// Download audio from Roblox
async function downloadRobloxAudio(assetId) {
    const downloadUrl = `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`;
    const tempPath = path.join(__dirname, 'temp', `${assetId}.mp3`);
    
    // Create temp directory if it doesn't exist
    if (!fs.existsSync(path.join(__dirname, 'temp'))) {
        fs.mkdirSync(path.join(__dirname, 'temp'));
    }
    
    try {
        const response = await axios({
            method: 'GET',
            url: downloadUrl,
            responseType: 'stream'
        });
        
        const writer = fs.createWriteStream(tempPath);
        response.data.pipe(writer);
        
        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(tempPath));
            writer.on('error', reject);
        });
    } catch (error) {
        throw new Error(`Failed to download audio: ${error.message}`);
    }
}

// Analyze audio file using FFmpeg
async function analyzeAudio(audioPath) {
    try {
        // Get audio duration
        const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`;
        const { stdout: durationOutput } = await execAsync(durationCmd);
        const duration = parseFloat(durationOutput.trim());
        
        console.log(`[INFO] Audio duration: ${duration.toFixed(2)}s`);
        
        // Sample interval (every 0.1 seconds)
        const interval = 0.1;
        const numSamples = Math.floor(duration / interval);
        
        const samples = [];
        
        // Analyze in chunks
        for (let i = 0; i < numSamples; i += 10) {
            const chunkPromises = [];
            
            for (let j = 0; j < 10 && (i + j) < numSamples; j++) {
                const time = (i + j) * interval;
                chunkPromises.push(analyzeSample(audioPath, time, interval));
            }
            
            const chunkResults = await Promise.all(chunkPromises);
            samples.push(...chunkResults);
            
            if (i % 50 === 0) {
                console.log(`[PROGRESS] Analyzed ${i}/${numSamples} samples`);
            }
        }
        
        return {
            assetId: path.basename(audioPath, '.mp3'),
            duration: duration,
            interval: interval,
            samples: samples.length,
            data: samples
        };
        
    } catch (error) {
        throw new Error(`Audio analysis failed: ${error.message}`);
    }
}

// Analyze a single time sample
async function analyzeSample(audioPath, time, duration) {
    try {
        // Extract audio segment and get stats
        const statsCmd = `ffmpeg -ss ${time} -t ${duration} -i "${audioPath}" -af "volumedetect,astats=metadata=1:reset=1" -f null - 2>&1`;
        
        const { stdout } = await execAsync(statsCmd);
        
        // Parse FFmpeg output for amplitude
        const rmsMatch = stdout.match(/RMS level dB: ([-\d.]+)/);
        const peakMatch = stdout.match(/Peak level dB: ([-\d.]+)/);
        
        const rmsDb = rmsMatch ? parseFloat(rmsMatch[1]) : -60;
        const peakDb = peakMatch ? parseFloat(peakMatch[1]) : -60;
        
        // Convert dB to linear amplitude (0-1 range)
        const amplitude = Math.pow(10, rmsDb / 20);
        const peak = Math.pow(10, peakDb / 20);
        
        // Estimate frequency bands (simplified)
        // In a real implementation, you'd use FFT analysis
        const bass = amplitude * (0.8 + Math.random() * 0.2);
        const mid = amplitude * (0.7 + Math.random() * 0.3);
        const high = amplitude * (0.6 + Math.random() * 0.4);
        
        return {
            time: parseFloat(time.toFixed(2)),
            amplitude: parseFloat(amplitude.toFixed(4)),
            bass: parseFloat(bass.toFixed(4)),
            mid: parseFloat(mid.toFixed(4)),
            high: parseFloat(high.toFixed(4)),
            peak: parseFloat(peak.toFixed(4))
        };
        
    } catch (error) {
        // Return default values on error
        return {
            time: parseFloat(time.toFixed(2)),
            amplitude: 0,
            bass: 0,
            mid: 0,
            high: 0,
            peak: 0
        };
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║  🎵 Roblox Audio Analysis API                     ║
║  Server running on port ${PORT}                      ║
║                                                   ║
║  Endpoints:                                       ║
║  • GET /api/analyze/:assetId                      ║
║  • GET /api/cache                                 ║
║                                                   ║
║  Ready to analyze audio! 🚀                       ║
╚═══════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[SHUTDOWN] Cleaning up...');
    // Clean temp directory
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
        fs.readdirSync(tempDir).forEach(file => {
            fs.unlinkSync(path.join(tempDir, file));
        });
    }
    process.exit(0);
});