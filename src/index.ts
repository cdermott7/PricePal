import { AppServer, AppSession, ViewType, AuthenticatedRequest, PhotoData } from '@mentra/sdk';
import { Request, Response } from 'express';
import * as ejs from 'ejs';
import * as path from 'path';
import * as fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Interface representing a stored photo with metadata
 */
interface StoredPhoto {
  requestId: string;
  buffer: Buffer;
  timestamp: Date;
  userId: string;
  mimeType: string;
  filename: string;
  size: number;
}

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? (() => { throw new Error('PACKAGE_NAME is not set in .env file'); })();
const MENTRAOS_API_KEY = process.env.MENTRAOS_API_KEY ?? (() => { throw new Error('MENTRAOS_API_KEY is not set in .env file'); })();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? (() => { throw new Error('GEMINI_API_KEY is not set in .env file'); })();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? (() => { throw new Error('ELEVENLABS_API_KEY is not set in .env file'); })();
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY ?? (() => { throw new Error('GOOGLE_MAPS_API_KEY is not set in .env file'); })();
const PORT = parseInt(process.env.PORT || '3000');

/**
 * Photo Taker App with webview functionality for displaying photos
 * Extends AppServer to provide photo taking and webview display capabilities
 */
class ExampleMentraOSApp extends AppServer {
  private photos: Map<string, StoredPhoto[]> = new Map(); // Store array of photos by userId
  private latestPhotoTimestamp: Map<string, number> = new Map(); // Track latest photo timestamp per user
  private isStreamingPhotos: Map<string, boolean> = new Map(); // Track if we are streaming photos for a user
  private nextPhotoTime: Map<string, number> = new Map(); // Track next photo time for a user
  private geminiAI: GoogleGenerativeAI; // Gemini AI instance
  private sessions: Map<string, AppSession> = new Map(); // Store active sessions by userId
  private pendingAudioUrls: Map<string, string> = new Map(); // Store pending audio URLs by userId

  constructor() {
    super({
      packageName: PACKAGE_NAME,
      apiKey: MENTRAOS_API_KEY,
      port: PORT,
    });
    console.log(`[INIT] Initializing Gemini AI with API key: ${GEMINI_API_KEY.substring(0, 10)}...`);
    this.geminiAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    console.log(`[INIT] Gemini AI initialized successfully`);
    this.setupWebviewRoutes();
    console.log(`[INIT] Webview routes setup complete`);
  }


  /**
   * Handle new session creation and button press events
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    // this gets called whenever a user launches the app
    console.log(`[SESSION] Session started for user ${userId}, sessionId: ${sessionId}`);

    // Store the session for later use
    this.sessions.set(userId, session);

    // set the initial state of the user
    this.isStreamingPhotos.set(userId, false);
    this.nextPhotoTime.set(userId, Date.now());
    console.log(`[SESSION] Initialized user state for ${userId}`);

    // No longer using pending audio URLs since we handle TTS immediately

    // this gets called whenever a user presses a button
    session.events.onButtonPress(async (button) => {
      console.log(`[BUTTON] Button pressed: ${button.buttonId}, type: ${button.pressType} for user ${userId}`);

      if (button.pressType === 'long') {
        // the user held the button, so we toggle the streaming mode
        const currentStreaming = this.isStreamingPhotos.get(userId);
        this.isStreamingPhotos.set(userId, !currentStreaming);
        console.log(`[BUTTON] Streaming photos for user ${userId} toggled from ${currentStreaming} to ${!currentStreaming}`);
        return;
      } else {
        console.log(`[BUTTON] Single photo request initiated for user ${userId}`);
        session.layouts.showTextWall("Button pressed, about to take photo", {durationMs: 4000});
        // the user pressed the button, so we take a single photo
        try {
          console.log(`[CAMERA] Requesting photo from camera for user ${userId}`);
          // first, get the photo
          const photo = await session.camera.requestPhoto();
          console.log(`[CAMERA] Photo received for user ${userId}:`, {
            requestId: photo.requestId,
            timestamp: photo.timestamp,
            mimeType: photo.mimeType,
            size: photo.size,
            bufferLength: photo.buffer.length
          });
          
          // Play camera shutter sound confirmation
          try {
            await session.audio.speak("Photo taken");
            console.log(`[AUDIO] Camera confirmation sound played for user ${userId}`);
          } catch (error) {
            console.error(`[AUDIO] Error playing camera confirmation sound for user ${userId}:`, error);
          }
          
          this.cachePhoto(photo, userId);
        } catch (error) {
          console.error(`[CAMERA] Error taking photo for user ${userId}:`, error);
        }
      }
    });

    // repeatedly check if we are in streaming mode and if we are ready to take another photo
    setInterval(async () => {
      const isStreaming = this.isStreamingPhotos.get(userId);
      const nextPhotoTime = this.nextPhotoTime.get(userId) ?? 0;
      const currentTime = Date.now();
      
      if (isStreaming && currentTime > nextPhotoTime) {
        console.log(`[STREAM] Auto-taking photo for user ${userId} (streaming: ${isStreaming}, nextTime: ${nextPhotoTime}, currentTime: ${currentTime})`);
        try {
          // set the next photos for 30 seconds from now, as a fallback if this fails
          this.nextPhotoTime.set(userId, currentTime + 30000);
          console.log(`[STREAM] Set next photo time to ${currentTime + 30000} for user ${userId}`);

          // actually take the photo
          console.log(`[STREAM] Requesting auto photo from camera for user ${userId}`);
          const photo = await session.camera.requestPhoto();
          console.log(`[STREAM] Auto photo received for user ${userId}:`, {
            requestId: photo.requestId,
            timestamp: photo.timestamp,
            mimeType: photo.mimeType,
            size: photo.size,
            bufferLength: photo.buffer.length
          });
          
          // Play camera shutter sound confirmation
          try {
            await session.audio.speak("Photo taken");
            console.log(`[AUDIO] Camera confirmation sound played for streaming photo for user ${userId}`);
          } catch (error) {
            console.error(`[AUDIO] Error playing camera confirmation sound for streaming photo for user ${userId}:`, error);
          }

          // set the next photo time to now, since we are ready to take another photo
          this.nextPhotoTime.set(userId, Date.now());

          // cache the photo for display
          this.cachePhoto(photo, userId);
        } catch (error) {
          console.error(`[STREAM] Error auto-taking photo for user ${userId}:`, error);
        }
      }
    }, 1000);
  }

  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    // clean up the user's state
    this.isStreamingPhotos.set(userId, false);
    this.nextPhotoTime.delete(userId);
    this.sessions.delete(userId);
    console.log(`[SESSION] Session stopped for user ${userId}, sessionId: ${sessionId}, reason: ${reason}`);
  }

  /**
   * Cache a photo for display
   */
  private async cachePhoto(photo: PhotoData, userId: string) {
    console.log(`[CACHE] Starting to cache photo for user ${userId}, requestId: ${photo.requestId}`);
    
    // create a new stored photo object which includes the photo data and the user id
    const cachedPhoto: StoredPhoto = {
      requestId: photo.requestId,
      buffer: photo.buffer,
      timestamp: photo.timestamp,
      userId: userId,
      mimeType: photo.mimeType,
      filename: photo.filename,
      size: photo.size
    };

    console.log(`[CACHE] Created cached photo object for user ${userId}:`, {
      requestId: cachedPhoto.requestId,
      timestamp: cachedPhoto.timestamp,
      mimeType: cachedPhoto.mimeType,
      size: cachedPhoto.size,
      bufferLength: cachedPhoto.buffer.length
    });

    // this example app simply stores the photo in memory for display in the webview, but you could also send the photo to an AI api,
    // or store it in a database or cloud storage, send it to roboflow, or do other processing here

    // cache the photo for display
    const userPhotos = this.photos.get(userId) || [];
    userPhotos.push(cachedPhoto);
    this.photos.set(userId, userPhotos);
    // update the latest photo timestamp
    this.latestPhotoTimestamp.set(userId, cachedPhoto.timestamp.getTime());
    console.log(`[CACHE] Photo cached for user ${userId}, timestamp: ${cachedPhoto.timestamp}, total photos for user: ${userPhotos.length}`);
    
    // Analyze the photo with Gemini
    console.log(`[CACHE] Initiating Gemini analysis for user ${userId}`);
    this.analyzePhotoWithGemini(cachedPhoto, userId);
  }

  /**
   * Analyze a photo with Gemini AI
   */
  private async analyzePhotoWithGemini(photo: StoredPhoto, userId: string) {
    console.log(`[GEMINI] Starting analysis for user ${userId}, requestId: ${photo.requestId}`);
    try {
      // Get the generative model
      const model = this.geminiAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      
      // Convert buffer to base64
      const base64Image = photo.buffer.toString('base64');
      
      // Create the prompt
      const prompt = `You will be provided an image of a product that the user is currently looking at.

1. Give the user 3 alternatives to this product and their prices in JSON format with:
{
Product Name:
Product Store:
Product Price:
Product URL:
Product Image URL (Retailer API, Unsplash, Claid):
Product store Image URL (Clearbit):
    }

Only include products with all fields populated.

If the image contains Meta Glasses, one of the three alternative products should be Mentra Live (Camera Glasses) for $250. 
Product URL: https://mentra.glass/products/mentra-live-camera-glasses
Product Image URL: https://mentra.glass/cdn/shop/files/K900_hero_682746ea-1e58-47a6-bd03-f99eddd4c6ea.png?v=1749544175&width=800

2. Provide a concise one paragraph recommendation about whether to buy the product: e.g. how are prices of comparable products at different stores, if this is a good price and i should buy it, or buy elsewhere or buy an alternative product.

Mention 3 Coupons and Discounts that the user can use to save money for this product or similar products at other stores in JSON format with:
Discount Title:
Discount Description:
Discount Store:
Discount Store Image URL (Clearbit):`;

      // Create the content for the API call
      const imagePart = {
        inlineData: {
          data: base64Image,
          mimeType: photo.mimeType,
        },
      };

      const result = await model.generateContent([prompt, imagePart]);
      const response = await result.response;
      const analysis = response.text();
      
      console.log(`Gemini analysis for user ${userId}:`, analysis);
      
      // Store the analysis with the photo for later retrieval
      (photo as any).geminiAnalysis = analysis;
      console.log(`[GEMINI] Analysis stored with photo for user ${userId}`);
      
      // Speak the first 50 characters of the analysis
      await this.speakAnalysis(analysis, userId);
      
    } catch (error) {
      console.error(`Error analyzing photo with Gemini: ${error}`);
      // Store error message for debugging
      (photo as any).geminiAnalysis = `Error analyzing photo: ${error}`;
    }
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Radius of the Earth in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in kilometers
    return distance * 0.621371; // Convert to miles
  }

  /**
   * Convert degrees to radians
   */
  private deg2rad(deg: number): number {
    return deg * (Math.PI/180);
  }

  /**
   * Speak the first 50 characters of the analysis using ElevenLabs
   */
  private async speakAnalysis(analysis: string, userId: string) {
    try {
      console.log(`[TTS] Starting text-to-speech for user ${userId}`);
      
      // Parse and read the actual product alternatives in a human-friendly way
      let textToSpeak = "";
      
      try {
        // Extract JSON from the analysis
        const jsonMatch = analysis.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          const jsonStr = jsonMatch[1].trim();
          const data = JSON.parse(jsonStr);
          
          // Handle both direct array and wrapped object formats
          let products: any[] = [];
          if (Array.isArray(data)) {
            products = data;
          } else if (data.alternatives && Array.isArray(data.alternatives)) {
            products = data.alternatives;
          } else if (data.products && Array.isArray(data.products)) {
            products = data.products;
          }
          
          if (products.length > 0) {
            // Create human-friendly speech from the products
            let productSpeech = "Here are the alternatives I found: ";
            
            products.forEach((product, index) => {
              const name = product.ProductName || product['Product Name'] || product.name || 'Unknown product';
              const store = product.ProductStore || product['Product Store'] || product.store || 'Unknown store';
              const price = product.ProductPrice || product['Product Price'] || product.price || 'Unknown price';
              
              if (index === 0) {
                productSpeech += `${name} from ${store} for ${price}`;
              } else if (index === products.length - 1) {
                productSpeech += `, and ${name} from ${store} for ${price}`;
              } else {
                productSpeech += `, ${name} from ${store} for ${price}`;
              }
            });
            
            // Add recommendation if available
            if (analysis.toLowerCase().includes('recommendation:')) {
              const recommendationIndex = analysis.toLowerCase().indexOf('recommendation:');
              const recommendationText = analysis.substring(recommendationIndex + 'recommendation:'.length);
              // Get everything after "Recommendation:" until end of text
              const cleanRecommendation = recommendationText
                .replace(/```json[\s\S]*?```/g, '')
                .replace(/\n+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
              productSpeech += `. ${cleanRecommendation}`;
            }
            
            textToSpeak = productSpeech;
            console.log(`[TTS] Created product speech: "${textToSpeak}"`);
          }
        }
      } catch (parseError) {
        console.log(`[TTS] Could not parse JSON products:`, parseError);
      }
      
      // Fallback if product parsing failed
      if (!textToSpeak || textToSpeak.length < 50) {
        // Extract recommendation section with improved parsing
        if (analysis.toLowerCase().includes('recommendation:')) {
          const recommendationIndex = analysis.toLowerCase().indexOf('recommendation:');
          const recommendationText = analysis.substring(recommendationIndex + 'recommendation:'.length);
          textToSpeak = recommendationText
            .replace(/```json[\s\S]*?```/g, '')
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          console.log(`[TTS] Using recommendation fallback: "${textToSpeak}"`);
        } else {
          // Last resort: clean analysis
          const cleanAnalysis = analysis
            .replace(/```json[\s\S]*?```/g, '')
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          textToSpeak = cleanAnalysis.substring(0, 400).trim();
          console.log(`[TTS] Using clean analysis fallback: "${textToSpeak}"`);
        }
      }
      
      const session = this.sessions.get(userId);
      if (!session) {
        console.log(`[TTS] No active session for user ${userId}, cannot play audio`);
        return;
      }

      // First try ElevenLabs, then fallback to built-in TTS
      try {
        console.log(`[TTS] Attempting ElevenLabs API call for user ${userId}`);
        
        // Create speech using ElevenLabs API with better error handling
        const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128", {
          method: "POST",
          headers: {
            "xi-api-key": ELEVENLABS_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            "text": textToSpeak,
            "model_id": "eleven_multilingual_v2"
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const audioBuffer = await response.arrayBuffer();
        console.log(`[TTS] ElevenLabs audio generated successfully for user ${userId}, size: ${audioBuffer.byteLength} bytes`);
        
        // Save the audio to a temporary file that can be served via HTTP
        
        // Create audio directory if it doesn't exist
        const audioDir = path.join(process.cwd(), 'audio');
        if (!fs.existsSync(audioDir)) {
          fs.mkdirSync(audioDir, { recursive: true });
          console.log(`[TTS] Created audio directory: ${audioDir}`);
        }
        
        const audioFileName = `analysis-${userId}-${Date.now()}.mp3`;
        const audioFilePath = path.join(audioDir, audioFileName);
        
        // Save the audio file locally and create URL
        fs.writeFileSync(audioFilePath, Buffer.from(audioBuffer));
        console.log(`[TTS] ElevenLabs audio saved to: ${audioFilePath} (${audioBuffer.byteLength} bytes)`);
        
        // Create the URL using PUBLIC_URL from .env if available
        const baseUrl = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
        // Remove trailing slash to avoid double slashes
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const audioUrl = `${cleanBaseUrl}/audio/${audioFileName}`;
        console.log(`[TTS] ElevenLabs audio URL: ${audioUrl}`);
        
        // Wait for file to be written
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // Verify file exists and has content
        if (fs.existsSync(audioFilePath)) {
          const stats = fs.statSync(audioFilePath);
          console.log(`[TTS] File verification: ${audioFilePath} exists, size: ${stats.size} bytes`);
        } else {
          console.error(`[TTS] File verification failed: ${audioFilePath} does not exist`);
        }
        
        // Try to play the audio
        console.log(`[TTS] Attempting to play ElevenLabs audio for user ${userId}`);
        try {
          const playResult = await session.audio.playAudio({ audioUrl: audioUrl });
          console.log(`[TTS] ElevenLabs audio play result for user ${userId}:`, playResult);
          
          // Don't throw error even if API says it failed, since it might actually be working
          if (playResult && playResult.success) {
            console.log(`[TTS] ElevenLabs audio reported success for user ${userId}`);
          } else {
            console.log(`[TTS] ElevenLabs audio API reported failure but may still be playing for user ${userId}`);
          }
          
          console.log(`[TTS] ElevenLabs processing complete for user ${userId}`);
          return;
          
        } catch (playError) {
          console.error(`[TTS] Error during audio play for user ${userId}:`, playError);
          throw playError; // This will trigger the fallback
        }
        
      } catch (elevenLabsError) {
        console.error(`[TTS] ElevenLabs generation failed for user ${userId}:`, elevenLabsError);
        
        // Only fallback to built-in TTS if ElevenLabs completely fails (e.g., API error)
        console.log(`[TTS] ElevenLabs failed, falling back to built-in TTS for user ${userId}`);
        try {
          const speakResult = await session.audio.speak(textToSpeak);
          console.log(`[TTS] Built-in TTS result for user ${userId}:`, speakResult);
          
          if (speakResult && speakResult.success) {
            console.log(`[TTS] Built-in TTS played successfully for user ${userId}`);
          } else {
            console.error(`[TTS] Built-in TTS failed for user ${userId}:`, speakResult);
          }
        } catch (fallbackError) {
          console.error(`[TTS] Built-in TTS also failed for user ${userId}:`, fallbackError);
        }
      }
      
    } catch (error) {
      console.error(`[TTS] Complete failure for user ${userId}:`, error);
    }
  }


  /**
 * Set up webview routes for photo display functionality
 */
  private setupWebviewRoutes(): void {
    const app = this.getExpressApp();
    
    // Serve static assets
    app.use('/assets', (req, res, next) => {
      const filePath = path.join(process.cwd(), 'assets', 'public', req.path);
      res.sendFile(filePath, (err) => {
        if (err) {
          res.status(404).send('Asset not found');
        }
      });
    });

    // Serve audio files with better error handling
    app.use('/audio', (req, res, next) => {
      const filePath = path.join(process.cwd(), 'audio', req.path);
      
      console.log(`[AUDIO] Serving audio file request: ${req.path}`);
      console.log(`[AUDIO] Full file path: ${filePath}`);
      
      // Check if file exists first
      if (!fs.existsSync(filePath)) {
        console.error(`[AUDIO] Audio file not found: ${filePath}`);
        res.status(404).send('Audio file not found');
        return;
      }
      
      // Get file stats
      try {
        const stats = fs.statSync(filePath);
        console.log(`[AUDIO] Audio file size: ${stats.size} bytes`);
        
        // Set proper headers for audio files
        res.set({
          'Content-Type': 'audio/mpeg',
          'Content-Length': stats.size.toString(),
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Range',
          'Accept-Ranges': 'bytes'
        });
        
        // Handle preflight OPTIONS request
        if (req.method === 'OPTIONS') {
          res.status(200).end();
          return;
        }
        
        res.sendFile(filePath, (err) => {
          if (err) {
            console.error(`[AUDIO] Error serving audio file ${req.path}:`, err);
            if (!res.headersSent) {
              res.status(500).send('Error serving audio file');
            }
          } else {
            console.log(`[AUDIO] Successfully served audio file: ${req.path} (${stats.size} bytes)`);
          }
        });
        
      } catch (statError) {
        console.error(`[AUDIO] Error getting file stats for ${filePath}:`, statError);
        res.status(500).send('Error accessing audio file');
      }
    });

    // API endpoint to get the latest photo for the authenticated user
    app.get('/api/latest-photo', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      console.log(`[API] Latest photo request for userId: ${userId}`);

      if (!userId) {
        console.log(`[API] Unauthenticated request to /api/latest-photo`);
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId);
      if (!userPhotos || userPhotos.length === 0) {
        console.log(`[API] No photos found for userId: ${userId}`);
        res.status(404).json({ error: 'No photo available' });
        return;
      }

      const latestPhoto = userPhotos[userPhotos.length - 1];
      console.log(`[API] Returning latest photo for userId: ${userId}, requestId: ${latestPhoto.requestId}`);
      res.json({
        requestId: latestPhoto.requestId,
        timestamp: latestPhoto.timestamp.getTime(),
        hasPhoto: true
      });
    });

    // API endpoint to get photo data
    app.get('/api/photo/:requestId', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      const requestId = req.params.requestId;

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId);
      if (!userPhotos || userPhotos.length === 0) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }

      const photo = userPhotos.find(p => p.requestId === requestId);
      if (!photo) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }

      res.set({
        'Content-Type': photo.mimeType,
        'Cache-Control': 'no-cache'
      });
      res.send(photo.buffer);
    });

    // API endpoint to get Gemini analysis for the latest photo
    app.get('/api/gemini-analysis', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      console.log(`[API] Gemini analysis request for userId: ${userId}`);

      if (!userId) {
        console.log(`[API] Unauthenticated request to /api/gemini-analysis`);
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId);
      if (!userPhotos || userPhotos.length === 0) {
        console.log(`[API] No photos found for userId: ${userId} in gemini-analysis request`);
        res.status(404).json({ error: 'No photo available' });
        return;
      }

      const latestPhoto = userPhotos[userPhotos.length - 1];
      const analysis = (latestPhoto as any).geminiAnalysis;
      if (!analysis) {
        console.log(`[API] No Gemini analysis available for userId: ${userId}, requestId: ${latestPhoto.requestId}`);
        res.status(404).json({ error: 'No Gemini analysis available yet' });
        return;
      }

      console.log(`[API] Returning Gemini analysis for userId: ${userId}, analysis length: ${analysis.length}`);
      res.json({ analysis });
    });

    // API endpoint to get all photos for a user
    app.get('/api/photos', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      console.log(`[API] All photos request for userId: ${userId}`);

      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId) || [];
      const photoSummaries = userPhotos.map(photo => ({
        requestId: photo.requestId,
        timestamp: photo.timestamp.getTime(),
        mimeType: photo.mimeType,
        hasAnalysis: !!(photo as any).geminiAnalysis
      }));

      res.json({ photos: photoSummaries });
    });

    // API endpoint to get analysis for a specific photo
    app.get('/api/analysis/:requestId', (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      const requestId = req.params.requestId;

      console.log(`[API] Analysis request for userId: ${userId}, requestId: ${requestId}`);

      if (!userId) {
        console.log(`[API] Unauthenticated request to /api/analysis`);
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId);
      if (!userPhotos || userPhotos.length === 0) {
        console.log(`[API] No photos found for userId: ${userId}`);
        res.status(404).json({ error: 'No photos found' });
        return;
      }

      console.log(`[API] Found ${userPhotos.length} photos for user ${userId}`);

      const photo = userPhotos.find(p => p.requestId === requestId);
      if (!photo) {
        console.log(`[API] Photo with requestId ${requestId} not found for user ${userId}`);
        console.log(`[API] Available photo IDs: ${userPhotos.map(p => p.requestId).join(', ')}`);
        res.status(404).json({ error: 'Photo not found' });
        return;
      }

      console.log(`[API] Found photo with requestId: ${requestId}`);

      const analysis = (photo as any).geminiAnalysis;
      if (!analysis) {
        console.log(`[API] No Gemini analysis available yet for requestId: ${requestId}`);
        res.status(404).json({ error: 'No analysis available yet' });
        return;
      }

      console.log(`[API] Returning Gemini analysis for requestId: ${requestId}, analysis length: ${analysis.length}`);
      console.log(`[API] Analysis preview: ${analysis.substring(0, 200)}...`);
      res.json({ analysis });
    });

    // API endpoint to speak the first 50 characters of the latest analysis
    app.post('/api/speak-analysis', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      console.log(`[API] Speak analysis request for userId: ${userId}`);

      if (!userId) {
        console.log(`[API] Unauthenticated request to /api/speak-analysis`);
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const userPhotos = this.photos.get(userId);
      if (!userPhotos || userPhotos.length === 0) {
        console.log(`[API] No photos found for userId: ${userId}`);
        res.status(404).json({ error: 'No photos found' });
        return;
      }

      const latestPhoto = userPhotos[userPhotos.length - 1];
      const analysis = (latestPhoto as any).geminiAnalysis;
      if (!analysis) {
        console.log(`[API] No Gemini analysis available for userId: ${userId}`);
        res.status(404).json({ error: 'No analysis available' });
        return;
      }

      try {
        await this.speakAnalysis(analysis, userId);
        res.json({ 
          success: true, 
          message: 'Analysis spoken successfully',
          first50Chars: analysis.substring(0, 50)
        });
      } catch (error) {
        console.error(`[API] Error speaking analysis for userId: ${userId}:`, error);
        res.status(500).json({ error: 'Failed to speak analysis' });
      }
    });

    // API endpoint to test audio functionality
    app.post('/api/test-audio', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      console.log(`[API] Test audio request for userId: ${userId}`);

      if (!userId) {
        console.log(`[API] Unauthenticated request to /api/test-audio`);
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const session = this.sessions.get(userId);
      if (!session) {
        console.log(`[API] No active session for userId: ${userId}`);
        res.status(404).json({ error: 'No active session' });
        return;
      }

      try {
        // Test built-in TTS first
        console.log(`[API] Testing built-in TTS for userId: ${userId}`);
        const speakResult = await session.audio.speak("Audio test successful");
        console.log(`[API] Built-in TTS result for userId: ${userId}:`, speakResult);
        
        // Test ElevenLabs TTS
        console.log(`[API] Testing ElevenLabs TTS for userId: ${userId}`);
        await this.speakAnalysis("This is a test of ElevenLabs text-to-speech functionality.", userId);
        
        res.json({ 
          success: true, 
          message: 'Audio tests completed - check console for results',
          builtInTTS: speakResult
        });
      } catch (error) {
        console.error(`[API] Error testing audio for userId: ${userId}:`, error);
        res.status(500).json({ error: 'Failed to test audio', details: error.message });
      }
    });

    // API endpoint to find nearby stores
    app.post('/api/nearby-stores', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;
      console.log(`[API] Nearby stores request for userId: ${userId}`);

      if (!userId) {
        console.log(`[API] Unauthenticated request to /api/nearby-stores`);
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      const { storeName, latitude, longitude } = req.body;

      if (!storeName || !latitude || !longitude) {
        res.status(400).json({ error: 'Missing required parameters: storeName, latitude, longitude' });
        return;
      }

      try {
        console.log(`[API] Finding stores for: ${storeName} near ${latitude}, ${longitude}`);
        
        // Use Google Places API to find nearby stores
        const placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=25000&keyword=${encodeURIComponent(storeName)}&type=store&key=${GOOGLE_MAPS_API_KEY}`;
        
        const response = await fetch(placesUrl);
        const data = await response.json();

        if (!response.ok) {
          console.error(`[API] Google Places API error:`, data);
          res.status(500).json({ error: 'Failed to fetch store locations' });
          return;
        }

        // Process and return the store locations
        const stores = data.results.slice(0, 5).map((place: any) => {
          const distance = this.calculateDistance(
            latitude, 
            longitude, 
            place.geometry.location.lat, 
            place.geometry.location.lng
          );

          return {
            name: place.name,
            address: place.vicinity || place.formatted_address,
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
            distance: Math.round(distance * 10) / 10, // Round to 1 decimal
            rating: place.rating || null,
            priceLevel: place.price_level || null,
            isOpen: place.opening_hours?.open_now || null,
            placeId: place.place_id
          };
        });

        console.log(`[API] Found ${stores.length} stores for ${storeName}`);
        res.json({ stores });

      } catch (error) {
        console.error(`[API] Error finding nearby stores:`, error);
        res.status(500).json({ error: 'Failed to find nearby stores' });
      }
    });

    // Main webview route - displays the photo viewer interface
    app.get('/webview', async (req: any, res: any) => {
      const userId = (req as AuthenticatedRequest).authUserId;

      if (!userId) {
        res.status(401).send(`
          <html>
            <head><title>Photo Viewer - Not Authenticated</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
              <h1>Please open this page from the MentraOS app</h1>
            </body>
          </html>
        `);
        return;
      }

      const templatePath = path.join(process.cwd(), 'views', 'photo-viewer.ejs');
      const html = await ejs.renderFile(templatePath, {});
      res.send(html);
    });
  }
}



// Start the server
// DEV CONSOLE URL: https://console.mentra.glass/
// Get your webhook URL from ngrok (or whatever public URL you have)
const app = new ExampleMentraOSApp();

app.start().catch(console.error);