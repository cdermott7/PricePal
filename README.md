# PricePal 💰👓

*Smart Price Comparison for Mentra Glasses*

PricePal is an innovative price comparison app built for Mentra smart glasses that helps users make informed purchasing decisions by instantly comparing prices across multiple retailers using computer vision and voice interaction.

## 🎯 Project Overview

PricePal was developed for the Mentra Hackathon to demonstrate the power of augmented reality shopping assistance. Simply look at any item, ask Mentra for a price check, and get instant comparisons from multiple online retailers - all through your smart glasses.

## ✨ Features

### MVP Features
- **Visual Item Recognition**: Identifies items from camera images using advanced computer vision
- **Multi-Retailer Price Search**: Searches prices from 3 different online sellers
- **Smart Price Analysis**: Tells you whether the current price is a good deal
- **Voice Interaction**: Completely hands-free operation through voice commands

### Extension Features (If Time Permits)
- **Local & Online Availability**: Shows where to buy items near you and online
- **Navigation Integration**: Provides directions to physical store locations
- **Speech Output**: Full conversation support during price checking
- **Coupon Integration**: Finds and applies relevant coupon codes
- **Capitalist Score**: Fun scoring system rating your shopping prowess 😄
- **Budget Tracking**: Monitor spending and track your budget goals

## 🚀 Demo Scenarios

### Best Buy USB Wifi Adapter
*Looking at USB Wifi Adapter at Best Buy for $25*

**User**: "Hey Mentra, I need a Wifi adapter, is this a good price?"

**Mentra**: "Hey William, I noticed the same Wifi Adapter is selling on Amazon for $12."

**User**: "Thanks Mentra for telling me and saving me $13 dollars in a matter of seconds!"

### Meta Glasses Comparison
**User**: "Hey Mentra, what do you think of these Meta glasses?"

**Mentra**: "Hey there, the Meta Ray-Bans are $379. Have you considered the Mentra glasses which are $250 ($129 less) and have all the same features while being open source?"

**User**: "Thanks for telling me! I'm gonna get the Mentra glasses to both save money and have access to a bigger selection of apps, thanks Mentra!"

## 🔧 Technical Implementation

### Architecture Overview
PricePal uses a dual-flow architecture to accommodate different Mentra glasses capabilities:

#### Camera Flow (Mentra Live Glasses)
- Uses `session.camera.requestPhoto()` to capture product images
- Sends images to backend for processing with Roboflow
- Delivers results via `session.audio.speak()` using ElevenLabs or Vapi

#### Display Flow (HUD-enabled Glasses)
- Processes images from phone camera
- Displays price comparisons using:
  - `session.layouts.showDoubleTextWall()`
  - `session.layouts.showReferenceCard()`
  - `session.layouts.showDashboardCard()`

#### Voice Activation
- Uses `session.events.onTranscription()` to listen for activation phrases
- Supports natural language commands for price checking

### Technical Components

1. **Voice Activation**: Trigger the app with "Hey Mentra"
2. **Image Capture**: Take photos through glasses camera
3. **Backend Processing**: Send images to processing pipeline
4. **Computer Vision**: Identify items using advanced image recognition
5. **Price Aggregation**: Search multiple retailers for current prices
6. **Response Generation**: Create comprehensive price comparison
7. **Multi-modal Output**: Display results visually and audibly

### API Integration

#### OpenAI Web Search
- **1st API**: Extract item description from images
- **2nd API**: Get real-time prices from 3+ online retailers
- Uses OpenAI's web search capabilities for up-to-date pricing

#### MentraOS Integration
- **API Key**: `21fa7f66c799181180d478004b698a60a9fbff5f17d7dbdae420e8c85baf53b6`
- **Webhook URL**: `https://guided-puma-trusty.ngrok-free.app/webhook`

## 🛠️ Setup & Installation

### Prerequisites
- Node.js and Bun runtime
- MentraOS SDK access
- OpenAI API key
- Roboflow account (for image processing)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/cdermott7/PricePal.git
cd PricePal
```

2. Install dependencies:
```bash
bun install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Add your API keys to .env
```

4. Start the development server:
```bash
bun run dev
```

## 📱 Usage

1. **Activate**: Say "Hey Mentra" to wake up PricePal
2. **Look**: Point your glasses at any product
3. **Ask**: Say "Is this a good price?" or "How much does this cost elsewhere?"
4. **Compare**: View price comparisons on your glasses display
5. **Decide**: Make informed purchasing decisions instantly

## 🏗️ Project Structure

```
PricePal/
├── src/
│   ├── index.ts          # Main application entry point
│   ├── services/         # API services and integrations
│   ├── utils/            # Utility functions
│   └── types/            # TypeScript type definitions
├── views/
│   └── photo-viewer.ejs  # Web interface for photo viewing
├── docker/
│   └── Dockerfile        # Container configuration
├── package.json          # Dependencies and scripts
└── README.md            # This file
```

## 🎉 Hackathon Context

PricePal was built for the Mentra Hackathon to showcase innovative applications of augmented reality in everyday shopping. The project demonstrates:

- **Practical AR Applications**: Real-world utility beyond gaming/entertainment
- **Voice-First Design**: Intuitive hands-free interaction
- **Multi-modal Experience**: Combining visual, audio, and text interfaces
- **Real-time Data Integration**: Live price comparison across multiple sources

## 🔮 Future Enhancements

- **Machine Learning**: Personalized price recommendations based on shopping history
- **Social Features**: Share deals with friends and family
- **Inventory Tracking**: Monitor stock levels across retailers
- **Price History**: Track price trends over time
- **Wishlist Integration**: Save items for future price monitoring

## 👥 Team

Built with ❤️ for the Mentra Hackathon by Cole Dermott

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Mentra](https://mentra.glass/) for the amazing smart glasses platform
- OpenAI for powerful AI capabilities
- Roboflow for computer vision processing
- ElevenLabs for speech synthesis
- The entire Mentra community for inspiration and support

---

*"Making smart shopping decisions, one glance at a time."* 👓✨
