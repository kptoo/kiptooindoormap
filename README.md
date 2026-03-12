<div align=center>
<img align="center" src="public/images/logo.svg" alt="kiptooindoormap" width="100"/>
<h1 style="font-family: 'Arial', sans-serif; font-size: 48px; margin: 20px 0; color: #2c3e50;">KiptooIndoorMap</h1>

## 🚀 **[LIVE DEMO: kiptooindoormapper.vercel.app](https://kiptooindoormapper.vercel.app/)**

<p>
<img src="https://img.shields.io/badge/version-Pre--Alpha_Dev_Release-green" alt="Pre-Alpha Dev Release"/>
<img src="https://img.shields.io/badge/maintained_by-kptoo-blue" alt="Maintained by kptoo"/>
</p>
<img alt="License badge" src="https://img.shields.io/github/license/kptoo/kiptooindoormap"/>
<img alt="GitHub last commit badge" src="https://img.shields.io/github/last-commit/kptoo/kiptooindoormap"/>
<img alt="GitHub commit activity badge" src="https://img.shields.io/github/commit-activity/m/kptoo/kiptooindoormap"/>
<img alt="GitHub stars" src="https://img.shields.io/github/stars/kptoo/kiptooindoormap"/>
</p>

---

## 📧 **Get in Touch**

Have questions or want to collaborate? Let's connect!

- 📧 **Email:** [winermmanuel@gmail.com](mailto:winermmanuel@gmail.com)
- 💬 **WhatsApp:** [+254702743039](https://wa.me/254702743039)

---

</div>

## 📍 Overview

**KiptooIndoorMap** is an open-source, minimalist indoor navigation solution built with modern web technologies. Designed for self-hosting, it empowers users to navigate complex indoor spaces such as shopping malls, airports, hospitals, and universities with ease.

![Demo of KiptooIndoorMap](https://github.com/user-attachments/assets/343bd636-05e9-4c8c-a6ad-64a53374cbf7)

## 🛠️ Tech Stack

This project is built with a modern, performance-focused technology stack:

- **TypeScript** (95.8%) - Type-safe, scalable codebase
- **React + Remix** - Full-stack web framework with SSR
- **MapLibre GL** - Open-source mapping library
- **JavaScript** (2.1%) - Dynamic interactivity
- **CSS** (2.1%) - Responsive styling

## 📦 Release Status

**Current Version: Pre-Alpha (Map Viewer Demo Only)**

This is an early development release featuring a **demo-only map viewer**. You can explore the basic indoor navigation functionality, but please note that breaking changes may occur as development progresses.

### 🚀 What's Coming Next?

We're actively building out the project. Our upcoming milestones include:

- **Map Editor:** User-friendly tools to create and edit indoor maps
- **Backend Integration:** Robust infrastructure for map data management and scalability
- **Enhanced Navigation Features:** Improved pathfinding and accessibility options
- **Multi-Building Support:** Scale to multiple venues

Contributions, feedback, and issue reports are always welcome!

## 🎯 Why KiptooIndoorMap?

Existing indoor navigation solutions often fall short:
- Limited customization and flexibility
- Expensive, proprietary systems
- Lack of community support
- Difficult to adapt to diverse environments

**KiptooIndoorMap** solves these problems by offering:

- ✅ **Self-Hosted Control** - Deploy on your own infrastructure with full customization
- ✅ **Open-Source** - Transparent, community-driven development
- ✅ **OSM Integration** - Built on OpenStreetMap's trusted, open platform
- ✅ **Minimalist Design** - Feature-rich without unnecessary complexity
- ✅ **Modern Stack** - Built with cutting-edge web technologies

## ✨ Key Features

- 🗺️ **Indoor Navigation** - Detailed, interactive indoor maps for large spaces
- ⚙️ **Admin Dashboard** - Manage maps, routes, and system configuration
- 🏢 **Multi-Floor Support** - Seamless navigation across building levels
- 🔍 **POI Search** - Find points of interest with autocomplete
- 📍 **Turn-by-Turn Directions** - Step-by-step navigation guidance
- 🌓 **Dark Mode Support** - Comfortable viewing in any lighting
- ♿ **Accessibility Features** - Inclusive navigation for all users

## 🏗️ Architecture

KiptooIndoorMap uses a modern, layered architecture:

```
Frontend (React + Remix)
    ↓
MapLibre GL (Rendering)
    ↓
Dijkstra Pathfinding Algorithm
    ↓
GeoJSON Data Format
    ↓
OpenStreetMap Integration
```

### Core Technologies:
- **Routing:** Dijkstra's algorithm for optimal pathfinding
- **Data Format:** GeoJSON for flexible spatial data
- **Visualization:** MapLibre GL for performant map rendering
- **Search:** Full-text search with MiniSearch library

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/kptoo/kiptooindoormap.git
cd kiptooindoormap

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:5173` to see your map!

### Deployment

Deploy to Vercel with one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/git/external?repository-url=https://github.com/kptoo/kiptooindoormap)

Or deploy to any hosting platform that supports Node.js applications.

## 📊 Project Structure

```
kiptooindoormap/
├── app/
│   ├── components/          # React components
│   ├── routes/              # Remix routes
│   ├── indoor-directions/   # Routing engine
│   ├── types/               # TypeScript types
│   ├── utils/               # Utilities (pathfinding, geocoding)
│   └── mock/                # Sample data
├── public/
│   ├── images/              # Logo and icons
│   └── styles/              # CSS stylesheets
├── package.json
└── vite.config.ts
```

## 🤝 Contributing

We welcome contributions from the community! Here's how you can help:

1. **Report Bugs** - Found an issue? [Open a GitHub issue](https://github.com/kptoo/kiptooindoormap/issues)
2. **Suggest Features** - Have an idea? [Start a discussion](https://github.com/kptoo/kiptooindoormap/discussions)
3. **Submit Code** - Ready to code? Fork the repo and submit a pull request
4. **Improve Docs** - Help us document better!
5. **Share Feedback** - Email or WhatsApp your thoughts directly!

### Development Workflow

```bash
# Create a new branch
git checkout -b feature/your-feature-name

# Make your changes
# Commit with clear messages
git add .
git commit -m "feat: describe your feature"

# Push and create a PR
git push origin feature/your-feature-name
```

## 📚 Documentation

- [Architecture Overview](./docs/architecture.md)
- [API Reference](./docs/api.md)
- [Deployment Guide](./docs/deployment.md)
- [Contributing Guide](./CONTRIBUTING.md)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Support

If you find this project helpful, please consider:

- ⭐ **Starring** the repository
- 🐛 **Reporting bugs** and suggesting improvements
- 📢 **Sharing** with your network
- 💬 **Getting in touch** with feedback and ideas

**Contact Information:**
- 📧 Email: [winermmanuel@gmail.com](mailto:winermmanuel@gmail.com)
- 💬 WhatsApp: [+254702743039](https://wa.me/254702743039)

---

## 🗺️ Built with ❤️ by [Kptoo](https://github.com/kptoo)

**Let's make indoor navigation accessible to everyone!** 🚀
