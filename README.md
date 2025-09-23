# 🐍 Snake AI Pro

Try the AI simulation here https://nomarcus.github.io/SnakeAI/

An intelligent Snake game with sophisticated AI algorithms and real-time parameter tuning. Experience perfect gameplay through advanced pathfinding and adaptive strategies.

![image](https://github.com/user-attachments/assets/1813b35b-1039-436f-b93e-65ea9753dcad)


## ✨ Features

### 🧠 Advanced AI Algorithms
- **Hamilton Cycle**: Guaranteed path that visits every cell exactly once
- **Adaptive Pathfinding**: Dynamic strategy switching based on game state
- **Loop Detection**: Intelligent avoidance of repetitive patterns
- **Compact Mode**: Efficient navigation in tight spaces
- **Endgame Optimization**: Special strategy when board fills up

### 🎮 Interactive Controls
- **Real-time Parameter Tuning**: Adjust AI behavior while playing
- **Multiple Grid Sizes**: From 10x10 to 60x60 for different challenges
- **Speed Control**: Adjust game speed from 1ms to 500ms
- **Live Strategy Display**: See what the AI is thinking in real-time
- **Browser Training Sandbox**: Train multiple environments simultaneously in the browser, toggle auto mode, and load saved models without running Node.js

### 🎨 Modern Design
- **Glassmorphism UI**: Beautiful modern interface with blur effects
- **2.5D Graphics**: Enhanced visuals with gradients and shadows
- **Responsive Design**: Works on desktop, tablet, and mobile
- **Smooth Animations**: Fluid transitions and effects

### 📊 Game Analytics
- **Real-time Statistics**: Track length, progress, and free cells
- **Strategy Monitoring**: Live display of current AI strategy
- **Performance Metrics**: Analyze AI decision-making process

## 🚀 Getting Started

### Prerequisites
- Modern web browser with HTML5 Canvas support
- No additional dependencies required

### Installation
1. Clone the repository:
```bash
git clone https://github.com/yourusername/snake-ai-pro.git
```

2. Open `index.html` in your web browser:
```bash
cd snake-ai-pro
open index.html
```

That's it! The game runs entirely in the browser.

## 🎯 How to Use

### Basic Controls
- **Start/Restart**: Click the restart button to begin a new game
- **Speed Control**: Use the slower/faster buttons to adjust game speed
- **Grid Size**: Adjust columns and rows for different board sizes

### AI Parameter Tuning

#### Loop Streak Threshold (1-10)
- **Low (1-3)**: Quickly switches to safe Hamilton mode
- **Medium (4-6)**: Balanced approach allowing some loops
- **High (7-10)**: Aggressive, allows many loops but risky

#### No Progress Threshold (10-200+)
- **Low (10-50)**: Gives up quickly, very safe approach
- **Medium (50-100)**: Standard patience level
- **High (100+)**: Persistent, keeps trying for extended periods

#### Endgame Threshold (10-100+)
- **Low (10-30)**: Endgame strategy only at the very end
- **Medium (40-60)**: Safer, activates endgame mode earlier
- **High (70+)**: Very cautious, switches to safe mode early

#### Compact Mode Steps (50-300+)
- **Low (50-100)**: Short zig-zag patterns
- **Medium (100-200)**: Standard length sequences
- **High (200+)**: Extended zig-zag navigation

## 🏆 Preset Configurations

The game includes several optimized presets:

- **🏃 Speed Run (15x15)**: Fastest completion with acceptable risk
- **🛡️ Safe & Stable (15x15)**: Almost guaranteed win, slow but safe
- **⚖️ Balanced (20x20)**: Perfect balance of speed and safety
- **🐜 Small Grid (10x10)**: Optimized for tight spaces
- **🐘 Large Grid (25x25)**: Long-distance marathon navigation
- **🎯 Ultra Challenge (30x30)**: Expert level with maximum grid

## 🔧 Technical Implementation

### Core Technologies
- **Vanilla JavaScript**: Optimal performance without frameworks
- **HTML5 Canvas**: Smooth 60fps rendering
- **CSS3**: Modern animations and glassmorphism effects
- **Responsive Design**: Mobile-first approach

### AI Algorithms
- **Breadth-First Search (BFS)**: Optimal pathfinding to fruit
- **A* Algorithm**: Intelligent navigation with heuristics
- **Hamilton Cycle**: Failsafe guaranteed completion path
- **Flood Fill**: Space analysis for safe movement
- **Loop Detection**: Pattern recognition to avoid cycles

### Game Architecture
```
├── Game State Management
├── AI Strategy Engine
│   ├── Hamilton Cycle Generator
│   ├── Pathfinding Algorithms
│   ├── Loop Detection System
│   └── Strategy Selection Logic
├── Rendering Engine
│   ├── 2.5D Graphics
│   ├── Particle Effects
│   └── UI Components
└── Parameter Control System
```

## 📈 Performance

- **Frame Rate**: Consistent 60fps on modern browsers
- **Memory Usage**: Optimized for minimal memory footprint
- **Scalability**: Handles grids up to 60x60 efficiently
- **Battery Friendly**: Intelligent rendering reduces power consumption

## 🎓 Educational Value

Perfect for learning:
- **Algorithm Design**: Study different pathfinding approaches
- **AI Strategy**: Understand decision-making in constrained environments
- **Game Development**: Modern web game architecture
- **Parameter Optimization**: Real-time algorithm tuning

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Areas for Contribution
- New AI strategies
- Performance optimizations
- UI/UX improvements
- Mobile responsiveness enhancements
- Additional game modes

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👨‍💻 Author

**Marcus Petersson**
- Email: nomarcus@hotmail.com
- GitHub: [@yourusername](https://github.com/yourusername)

## 🙏 Acknowledgments

- Inspired by classic Snake game implementations
- Built with modern web technologies
- Special thanks to the web development community

⭐ **Star this repository if you found it helpful!**

🐍 **Happy Snake AI gaming!**
