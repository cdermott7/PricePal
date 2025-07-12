/**
 * Test script for ElevenLabs text-to-speech functionality
 * This script demonstrates how to speak the first 50 characters of an analysis
 */

const ELEVENLABS_API_KEY = "sk_cf6...";

async function speakAnalysis(analysis: string): Promise<void> {
  try {
    console.log(`[TTS] Starting text-to-speech`);
    
    // Get the first 50 characters of the analysis
    const first50Chars = analysis.substring(0, 50);
    console.log(`[TTS] First 50 characters: "${first50Chars}"`);
    
    // Create speech using ElevenLabs API
    const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb?output_format=mp3_44100_128", {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        "text": first50Chars,
        "model_id": "eleven_multilingual_v2"
      }),
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status} ${response.statusText}`);
    }

    const audioBuffer = await response.arrayBuffer();
    console.log(`[TTS] Audio generated successfully, size: ${audioBuffer.byteLength} bytes`);
    
    // Save the audio to a file for testing
    const fs = require('fs');
    const path = require('path');
    
    const outputPath = path.join(__dirname, 'analysis-speech.mp3');
    fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
    console.log(`[TTS] Audio saved to: ${outputPath}`);
    console.log(`[TTS] You can now play this file to hear the spoken analysis`);
    
  } catch (error) {
    console.error(`[TTS] Error generating speech:`, error);
  }
}

// Example analysis text (similar to what Gemini would generate)
const exampleAnalysis = `Here are 3 alternatives to this product:

1. Product Name: Samsung Galaxy S23
   Product Store: Best Buy
   Product Price: $799.99

2. Product Name: Google Pixel 7
   Product Store: Amazon
   Product Price: $599.99

3. Product Name: OnePlus 11
   Product Store: OnePlus Store
   Product Price: $699.99

Recommendation: This appears to be a good price for the current market, and I would recommend purchasing this product as it offers good value for money.`;

// Run the test
console.log("Testing ElevenLabs text-to-speech functionality...");
speakAnalysis(exampleAnalysis).then(() => {
  console.log("Test completed!");
}).catch((error) => {
  console.error("Test failed:", error);
}); 