# 🧠 FocusFlow - Smart Tab & Workspace Manager

> **Conquer tab chaos with intelligent, context-aware workspaces**

FocusFlow is a Chrome extension that automatically organizes your browser tabs into smart workspaces, helping you stay focused and reduce cognitive overload. Say goodbye to tab hoarding and hello to effortless organization.

---

## ✨ Features

### Current (MVP)
- 🎯 **Auto-Grouping** - Automatically suggests workspaces based on domain patterns, keywords, and time of day
- 💾 **Pause & Resume** - Hibernate workspaces to free up RAM, reopen them instantly later
- ⭐ **Priority Marking** - Star important tabs so they stand out from background noise
- 🔄 **Cross-Device Sync** - Access your workspaces from any Chrome device (Premium)
- 🎨 **Beautiful UI** - Minimalist black & white design with dark mode
- 🔒 **Privacy First** - All data stored locally by default, encrypted cloud sync optional

### Coming Soon (Roadmap)
- 🤖 **AI-Powered Suggestions** - Machine learning to understand your workflow patterns
- 🔗 **Integrations** - Send tabs to Notion, Todoist, Slack
- 👥 **Shared Workspaces** - Collaborate with teammates on research projects
- 📊 **Productivity Analytics** - Track tab usage, memory saved, focus time
- 📱 **Mobile Companion** - View and manage workspaces from your phone

---

## 🚀 Installation

### For Users (Chrome Web Store)
_Coming soon - extension pending review_

1. Visit the [Chrome Web Store](https://chrome.google.com/webstore) (link pending)
2. Click "Add to Chrome"
3. Pin the extension to your toolbar
4. Start organizing!

### For Developers (Local Installation)

#### Prerequisites
- **Node.js** v18+ ([Download](https://nodejs.org/))
- **Git** ([Download](https://git-scm.com/))
- **Chrome Browser** (for testing)

#### Setup Steps

```bash
# 1. Clone the repository
git clone https://github.com/Ambroise57/focusflow.git
cd focusflow

# 2. Install dependencies
npm install

# 3. Copy environment variables template
cp .env.example .env

# 4. Edit .env with your Supabase credentials (optional for MVP)
# Get credentials from: https://app.supabase.com/project/YOUR_PROJECT/settings/api
nano .env

# 5. Start development server
npm run dev

# 6. Load extension in Chrome
# - Open chrome://extensions/
# - Enable "Developer mode" (top right)
# - Click "Load unpacked"
# - Select the build/chrome-mv3-dev/ folder
```

**Verify it works:** You should see the FocusFlow icon in your toolbar. Click it to open the popup!

---

## 🛠️ Development

### Tech Stack

| Technology | Purpose |
|------------|---------|
| **Plasmo** | Chrome extension framework with HMR |
| **React 18** | UI library for components |
| **TypeScript** | Type-safe development |
| **Tailwind CSS** | Utility-first styling |
| **Zustand** | Lightweight state management |
| **Supabase** | Backend for cloud sync (Premium) |
| **Lucide React** | Clean, minimal icons |

### Project Structure

```
focusflow/
├── assets/              # Extension icons
├── src/
│   ├── background/      # Service worker (tab monitoring, auto-grouping)
│   ├── popup/           # Main UI (popup window)
│   │   └── components/  # React components
│   ├── contents/        # Content scripts (context menus, shortcuts)
│   ├── lib/             # Utilities (storage, Supabase, helpers)
│   ├── store/           # Zustand state management
│   ├── types/           # TypeScript interfaces
│   └── hooks/           # Custom React hooks
├── .env.example         # Environment variables template
├── package.json         # Dependencies and scripts
└── README.md            # You are here!
```

### Available Scripts

```bash
# Development (with hot reload)
npm run dev

# Production build
npm run build

# Type checking
npm run type-check

# Lint code
npm run lint

# Format code
npm run format
```

### Building for Production

```bash
# Build optimized extension
npm run build

# Output will be in: build/chrome-mv3-prod/
# Zip it for Chrome Web Store submission:
cd build/chrome-mv3-prod
zip -r ../../focusflow.zip .
```

---

## 🎨 Design System

FocusFlow uses a minimalist **black & white** color palette with carefully chosen accent colors:

| Purpose | Color | Tailwind Class |
|---------|-------|----------------|
| Background | `#0A0A0A` | `bg-background-primary` |
| Surface (cards) | `#1A1A1A` | `bg-background-surface` |
| Hover states | `#2A2A2A` | `bg-background-hover` |
| Primary text | `#FFFFFF` | `text-text-primary` |
| Secondary text | `#A0A0A0` | `text-text-secondary` |
| CTAs | `#3B82F6` | `bg-accent-blue` |
| Success | `#10B981` | `bg-accent-green` |
| Errors | `#EF4444` | `bg-accent-red` |

---

## 🔐 Privacy & Security

Your privacy is our top priority:

### What We Collect
- Tab URLs (sanitized - no sensitive query parameters)
- Tab titles
- Workspace names you create
- Extension usage statistics (if you opt in)

### What We DON'T Collect
- Browsing history beyond open tabs
- Page content or form data
- Passwords or personal information
- Data from incognito mode

### Data Storage
- **Free users:** 100% local storage (Chrome storage API)
- **Premium users:** Encrypted cloud backup via Supabase
  - End-to-end encryption (we can't read your data)
  - You control your data (export/delete anytime)

### Permissions Explained
- `tabs` - Read tab URLs and titles to organize them
- `storage` - Save workspaces locally
- `contextMenus` - Add right-click menu options
- `activeTab` - Access current tab when you interact with the extension

We only request permissions we absolutely need. No tracking, no ads, no shady business.

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Reporting Bugs
1. Check if the issue already exists in [Issues](https://github.com/Ambroise57/focusflow/issues)
2. If not, create a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots (if applicable)
   - Chrome version and OS

### Suggesting Features
1. Open a [Feature Request](https://github.com/Ambroise57/focusflow/issues/new)
2. Describe the feature and why it would be useful
3. Provide mockups or examples if possible

### Pull Requests
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit with clear messages (`git commit -m "feat: Add amazing feature"`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request with:
   - Description of changes
   - Screenshots/demos
   - Link to related issue

### Code Style
- Use TypeScript strict mode (no `any` types)
- Follow existing naming conventions
- Add JSDoc comments for complex functions
- Write meaningful commit messages ([Conventional Commits](https://www.conventionalcommits.org/))
- Ensure `npm run lint` passes before submitting

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

**TL;DR:** You can use, modify, and distribute this code freely, just include the original license.

---

## 🙏 Acknowledgments

FocusFlow is built with amazing open-source tools:

- [Plasmo](https://www.plasmo.com/) - Extension framework that made development a breeze
- [Supabase](https://supabase.com/) - Open-source Firebase alternative
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [Lucide](https://lucide.dev/) - Beautiful icon library
- [Chrome Extensions](https://developer.chrome.com/docs/extensions/) - Extensive documentation

Special thanks to the productivity and dev tools communities for inspiration!

---

## 📞 Support & Contact

- **Issues:** [GitHub Issues](https://github.com/Ambroise57/focusflow/issues)
- **Discussions:** [GitHub Discussions](https://github.com/Ambroise57/focusflow/discussions)
- **Email:** support@focusflow.app (coming soon)
- **Twitter:** [@FocusFlowApp](https://twitter.com/FocusFlowApp) (coming soon)

---

## 🗺️ Roadmap

### Phase 1: MVP
- [x] Auto-grouping by domain
- [x] Manual workspace creation
- [x] Pause/resume functionality
- [x] Local storage
- [x] Dark mode UI

### Phase 2: Intelligence
- [ ] AI-powered auto-grouping
- [ ] Keyword detection
- [ ] Time-based context
- [ ] Duplicate tab detection
- [ ] Memory usage stats

### Phase 3: Collaboration
- [ ] Cloud sync
- [ ] Shared workspaces
- [ ] Team features
- [ ] Workspace templates

### Phase 4: Ecosystem
- [ ] Notion integration
- [ ] Todoist integration
- [ ] Slack integration
- [ ] Mobile companion app
- [ ] Browser history analysis

---

## 💖 Show Your Support

If FocusFlow helps you stay organized:

- ⭐ **Star this repo** on GitHub
- 🐦 **Share it** with friends who have 100+ tabs open
- 🐛 **Report bugs** to help us improve
- 💡 **Suggest features** you'd love to see
- ☕ **Buy us a coffee** (link coming soon)

---

<div align="center">

**Made with ❤️ by [Ambroise52](https://github.com/Ambroise57)**

*Transforming tab chaos into focused productivity, one workspace at a time.*

[Website](https://focusflow.app) • [Documentation](https://docs.focusflow.app) • [Changelog](CHANGELOG.md)

</div>