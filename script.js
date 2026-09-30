const { useState, useRef, useEffect, useCallback } = React;

// Calculate optimal grid layout
function calculateGridLayout(videoCount) {
    if (videoCount === 0) return { cols: 1, rows: 1 };
    if (videoCount === 1) return { cols: 1, rows: 1 };
    if (videoCount === 2) return { cols: 2, rows: 1 };
    if (videoCount === 3) return { cols: 2, rows: 2 };
    if (videoCount === 4) return { cols: 2, rows: 2 };
    if (videoCount <= 6) return { cols: 3, rows: 2 };
    if (videoCount <= 9) return { cols: 3, rows: 3 };
    if (videoCount <= 12) return { cols: 4, rows: 3 };
    if (videoCount <= 16) return { cols: 4, rows: 4 };
    
    // Dynamic calculation for larger numbers
    const cols = Math.ceil(Math.sqrt(videoCount * 1.5));
    const rows = Math.ceil(videoCount / cols);
    return { cols, rows };
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, '0')}`;
}

function App() {
    const [videos, setVideos] = useState([]);
    const [gridLayout, setGridLayout] = useState({ cols: 1, rows: 1 });
    const [manualGrid, setManualGrid] = useState(null);
    const [outputSize, setOutputSize] = useState({ width: 1920, height: 1080 });
    const [gap, setGap] = useState(8);
    const [bgColor, setBgColor] = useState('#000000');
    const [fitMode, setFitMode] = useState('crop');
    const [duration, setDuration] = useState('longest');
    const [customDuration, setCustomDuration] = useState(30);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [previewVolume, setPreviewVolume] = useState(0.5);
    
    const canvasRef = useRef(null);
    const videoElementsRef = useRef({});
    const animationFrameRef = useRef(null);
    const playbackIntervalRef = useRef(null);

    // Update grid layout when videos change
    useEffect(() => {
        if (manualGrid === null) {
            setGridLayout(calculateGridLayout(videos.length));
        } else {
            setGridLayout(manualGrid);
        }
    }, [videos.length, manualGrid]);

    // Render frame to canvas
    const renderFrame = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = outputSize.width;
        canvas.height = outputSize.height;

        // Fill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (videos.length === 0) return;

        const layout = gridLayout;
        const cellWidth = (canvas.width - gap * (layout.cols - 1)) / layout.cols;
        const cellHeight = (canvas.height - gap * (layout.rows - 1)) / layout.rows;

        videos.forEach((video, index) => {
            const row = Math.floor(index / layout.cols);
            const col = index % layout.cols;
            const x = col * (cellWidth + gap);
            const y = row * (cellHeight + gap);

            const videoEl = videoElementsRef.current[video.id];
            
            if (videoEl && videoEl.readyState >= 2) { // HAVE_CURRENT_DATA
                ctx.save();

                if (fitMode === 'crop') {
                    // Crop/Fill mode - cover the cell
                    const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
                    const cellAspect = cellWidth / cellHeight;
                    
                    let sourceWidth = videoEl.videoWidth;
                    let sourceHeight = videoEl.videoHeight;
                    let sourceX = 0;
                    let sourceY = 0;

                    if (videoAspect > cellAspect) {
                        sourceWidth = videoEl.videoHeight * cellAspect;
                        sourceX = (videoEl.videoWidth - sourceWidth) / 2;
                    } else {
                        sourceHeight = videoEl.videoWidth / cellAspect;
                        sourceY = (videoEl.videoHeight - sourceHeight) / 2;
                    }

                    ctx.drawImage(
                        videoEl,
                        Math.floor(sourceX),
                        Math.floor(sourceY),
                        Math.floor(sourceWidth),
                        Math.floor(sourceHeight),
                        Math.floor(x),
                        Math.floor(y),
                        Math.floor(cellWidth),
                        Math.floor(cellHeight)
                    );
                } else if (fitMode === 'fit') {
                    // Fit mode - letterbox
                    const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
                    const cellAspect = cellWidth / cellHeight;
                    
                    if (videoAspect > cellAspect) {
                        const scaledHeight = cellWidth / videoAspect;
                        const offsetY = (cellHeight - scaledHeight) / 2;
                        ctx.drawImage(videoEl, Math.floor(x), Math.floor(y + offsetY), Math.floor(cellWidth), Math.floor(scaledHeight));
                    } else {
                        const scaledWidth = cellHeight * videoAspect;
                        const offsetX = (cellWidth - scaledWidth) / 2;
                        ctx.drawImage(videoEl, Math.floor(x + offsetX), Math.floor(y), Math.floor(scaledWidth), Math.floor(cellHeight));
                    }
                } else {
                    // Stretch mode
                    ctx.drawImage(videoEl, Math.floor(x), Math.floor(y), Math.floor(cellWidth), Math.floor(cellHeight));
                }

                ctx.restore();
            } else {
                // Placeholder
                ctx.fillStyle = '#2a3060';
                ctx.fillRect(x, y, cellWidth, cellHeight);
                ctx.fillStyle = '#6b7385';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Loading...', x + cellWidth / 2, y + cellHeight / 2);
            }
        });

        ctx.restore();
    }, [outputSize, gridLayout, gap, bgColor, fitMode, videos]);

    // Animation loop
    useEffect(() => {
        if (isPlaying) {
            const animate = () => {
                renderFrame();
                animationFrameRef.current = requestAnimationFrame(animate);
            };
            animationFrameRef.current = requestAnimationFrame(animate);

            return () => {
                if (animationFrameRef.current) {
                    cancelAnimationFrame(animationFrameRef.current);
                }
            };
        } else {
            renderFrame();
        }
    }, [isPlaying, renderFrame]);

    // Playback control
    const handlePlay = () => {
        setIsPlaying(true);
        Object.values(videoElementsRef.current).forEach(el => {
            if (el) {
                el.currentTime = currentTime;
                el.volume = previewVolume;
                el.play().catch(() => {});
            }
        });
    };

    const handlePause = () => {
        setIsPlaying(false);
        Object.values(videoElementsRef.current).forEach(el => {
            if (el) {
                el.pause();
            }
        });
    };

    const handleRestart = () => {
        setCurrentTime(0);
        Object.values(videoElementsRef.current).forEach(el => {
            if (el) {
                el.currentTime = 0;
            }
        });
        renderFrame();
    };

    const handleVolumeChange = (e) => {
        const vol = parseFloat(e.target.value);
        setPreviewVolume(vol);
        Object.values(videoElementsRef.current).forEach(el => {
            if (el) {
                el.volume = vol;
            }
        });
    };

    // Update current time during playback
    useEffect(() => {
        if (isPlaying) {
            const firstVideo = Object.values(videoElementsRef.current)[0];
            if (firstVideo) {
                const updateTime = () => {
                    setCurrentTime(firstVideo.currentTime);
                };
                const interval = setInterval(updateTime, 100);
                return () => clearInterval(interval);
            }
        }
    }, [isPlaying]);

    // Calculate total duration
    const calculateDuration = () => {
        if (videos.length === 0) return 0;
        if (duration === 'custom') return customDuration;
        
        const durations = videos.map(v => {
            const el = videoElementsRef.current[v.id];
            return el ? (el.duration || 0) : 0;
        }).filter(d => d > 0);

        if (durations.length === 0) return 0;
        if (duration === 'shortest') return Math.min(...durations);
        return Math.max(...durations);
    };

    const totalDuration = calculateDuration();

    // Handle file upload
    const handleFileUpload = (files) => {
        Array.from(files).forEach(file => {
            if (file.type.startsWith('video/')) {
                const newVideo = {
                    id: Math.random().toString(36).substr(2, 9),
                    file: file,
                    url: URL.createObjectURL(file),
                    muted: false,
                    duration: 0
                };
                setVideos(prev => [...prev, newVideo]);
            }
        });
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.currentTarget.classList.add('drag-active');
    };

    const handleDragLeave = (e) => {
        e.currentTarget.classList.remove('drag-active');
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove('drag-active');
        handleFileUpload(e.dataTransfer.files);
    };

    // Video operations
    const removeVideo = (id) => {
        setVideos(prev => prev.filter(v => v.id !== id));
        if (videoElementsRef.current[id]) {
            URL.revokeObjectURL(videoElementsRef.current[id].url);
            delete videoElementsRef.current[id];
        }
    };

    const toggleMute = (id) => {
        setVideos(prev => prev.map(v => 
            v.id === id ? { ...v, muted: !v.muted } : v
        ));
        const videoEl = videoElementsRef.current[id];
        if (videoEl) {
            videoEl.muted = !videoEl.muted;
        }
    };

    const duplicateVideo = (id, count) => {
        const original = videos.find(v => v.id === id);
        if (!original) return;
        const duplicates = Array.from({ length: count }, () => ({
            ...original,
            id: Math.random().toString(36).substr(2, 9)
        }));
        setVideos(prev => [...prev, ...duplicates]);
    };

    const duplicateAll = () => {
        const duplicates = videos.map(v => ({
            ...v,
            id: Math.random().toString(36).substr(2, 9)
        }));
        setVideos(prev => [...prev, ...duplicates]);
    };

    const randomizeVideos = () => {
        const shuffled = [...videos].sort(() => Math.random() - 0.5);
        setVideos(shuffled);
    };

    const exportVideo = async () => {
        if (videos.length === 0) {
            alert('Please add videos first');
            return;
        }
        alert('To export:\n\n1. Play the preview\n2. Use your browser\'s built-in screen recording feature\n3. Or use external tools like OBS Studio for higher quality\n\nThis preserves full quality at your selected resolution.');
    };

    return (
        <div className="app-container">
            {/* Left Sidebar */}
            <div className="sidebar">
                <div className="privacy-banner">
                    🔒 Your videos stay on your device
                </div>

                <div 
                    className="upload-area"
                    onClick={() => document.getElementById('fileInput').click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    <input
                        id="fileInput"
                        type="file"
                        multiple
                        accept="video/*"
                        onChange={(e) => handleFileUpload(e.target.files)}
                    />
                    <div className="upload-icon">📹</div>
                    <div className="upload-text">Drag videos here or click</div>
                    <div className="upload-hint">MP4, WebM, MOV supported</div>
                </div>

                <div className="video-list">
                    {videos.map((video, index) => (
                        <div key={video.id} className="video-card">
                            <div className="video-card-title">
                                {index + 1}. {video.file?.name?.substring(0, 25) || 'Video'}
                            </div>
                            <div className="video-card-controls">
                                <button 
                                    className="btn-small"
                                    onClick={() => toggleMute(video.id)}
                                >
                                    {video.muted ? '🔇' : '🔊'}
                                </button>
                                <button 
                                    className="btn-small danger"
                                    onClick={() => removeVideo(video.id)}
                                >
                                    🗑️ Remove
                                </button>
                            </div>
                            <div className="duplicate-options">
                                <button className="btn-small" onClick={() => duplicateVideo(video.id, 1)}>
                                    ✕2
                                </button>
                                <button className="btn-small" onClick={() => duplicateVideo(video.id, 4)}>
                                    ✕5
                                </button>
                                <button className="btn-small" onClick={() => duplicateVideo(video.id, 9)}>
                                    ✕10
                                </button>
                                <button className="btn-small" onClick={() => duplicateVideo(video.id, 1)}>
                                    Dup +1
                                </button>
                            </div>
                            <video
                                ref={(el) => {
                                    if (el) videoElementsRef.current[video.id] = el;
                                }}
                                src={video.url}
                                muted={true}
                                loop={true}
                                style={{ display: 'none' }}
                                crossOrigin="anonymous"
                            />
                        </div>
                    ))}
                </div>

                <div className="utility-buttons">
                    <button 
                        className="btn-utility"
                        onClick={duplicateAll}
                        disabled={videos.length === 0}
                    >
                        📋 Duplicate All
                    </button>
                    <button 
                        className="btn-utility"
                        onClick={randomizeVideos}
                        disabled={videos.length === 0}
                    >
                        🔀 Randomize
                    </button>
                </div>
            </div>

            {/* Center - Preview */}
            <div className="center-container">
                <div className="preview-area">
                    {videos.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-icon">📽️</div>
                            <div>Upload videos to get started</div>
                        </div>
                    ) : (
                        <canvas ref={canvasRef} />
                    )}
                </div>

                <div className="preview-controls">
                    <button 
                        className="btn-control"
                        onClick={handlePlay}
                        disabled={videos.length === 0 || isPlaying}
                    >
                        ▶️ Play
                    </button>
                    <button 
                        className="btn-control"
                        onClick={handlePause}
                        disabled={videos.length === 0 || !isPlaying}
                    >
                        ⏸️ Pause
                    </button>
                    <button 
                        className="btn-control"
                        onClick={handleRestart}
                        disabled={videos.length === 0}
                    >
                        🔄 Restart
                    </button>
                    
                    <div className="volume-control">
                        <span>🔊</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.1"
                            value={previewVolume}
                            onChange={handleVolumeChange}
                            className="volume-slider"
                        />
                    </div>

                    <div className="time-display">
                        {formatTime(currentTime)} / {formatTime(totalDuration)}
                    </div>

                    <button 
                        className="btn-control"
                        onClick={() => canvasRef.current?.requestFullscreen()}
                    >
                        ⛶ Fullscreen
                    </button>
                </div>
            </div>

            {/* Right Sidebar */}
            <div className="sidebar-right">
                {/* Grid Layout */}
                <div className="settings-section">
                    <label className="settings-label">Grid Layout</label>
                    <div className="setting-row">
                        <label>Auto Layout</label>
                        <input
                            type="checkbox"
                            className="checkbox"
                            checked={manualGrid === null}
                            onChange={(e) => setManualGrid(e.target.checked ? null : gridLayout)}
                        />
                    </div>
                    {manualGrid !== null && (
                        <>
                            <div className="setting-row">
                                <label>Columns:</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={manualGrid.cols}
                                    onChange={(e) => setManualGrid({
                                        ...manualGrid,
                                        cols: Math.max(1, parseInt(e.target.value) || 1)
                                    })}
                                />
                            </div>
                            <div className="setting-row">
                                <label>Rows:</label>
                                <input
                                    type="number"
                                    min="1"
                                    max="20"
                                    value={manualGrid.rows}
                                    onChange={(e) => setManualGrid({
                                        ...manualGrid,
                                        rows: Math.max(1, parseInt(e.target.value) || 1)
                                    })}
                                />
                            </div>
                        </>
                    )}
                    <div className="grid-visual" style={{
                        gridTemplateColumns: `repeat(${gridLayout.cols}, 1fr)`,
                        gridTemplateRows: `repeat(${gridLayout.rows}, 1fr)`
                    }}>
                        {Array.from({ length: gridLayout.cols * gridLayout.rows }).map((_, i) => (
                            <div 
                                key={i}
                                className={`grid-cell ${i < videos.length ? 'filled' : ''}`}
                            >
                                {i < videos.length ? i + 1 : ''}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Video Settings */}
                <div className="settings-section">
                    <label className="settings-label">Video Settings</label>
                    <div className="setting-row">
                        <label>Gap (px):</label>
                        <input
                            type="range"
                            min="0"
                            max="20"
                            value={gap}
                            onChange={(e) => setGap(parseInt(e.target.value))}
                        />
                        <span className="value-display">{gap}</span>
                    </div>
                    <div className="setting-row">
                        <label>Fit Mode:</label>
                        <select value={fitMode} onChange={(e) => setFitMode(e.target.value)}>
                            <option value="crop">Crop/Fill</option>
                            <option value="fit">Fit</option>
                            <option value="stretch">Stretch</option>
                        </select>
                    </div>
                    <div className="setting-row">
                        <label>Background:</label>
                        <input
                            type="color"
                            value={bgColor}
                            onChange={(e) => setBgColor(e.target.value)}
                            className="color-input"
                        />
                    </div>
                </div>

                {/* Output Settings */}
                <div className="settings-section">
                    <label className="settings-label">Output Size</label>
                    <div className="setting-row">
                        <select
                            value={`${outputSize.width}x${outputSize.height}`}
                            onChange={(e) => {
                                const [w, h] = e.target.value.split('x').map(Number);
                                setOutputSize({ width: w, height: h });
                            }}
                        >
                            <option value="1280x720">720p (1280×720)</option>
                            <option value="1920x1080">1080p (1920×1080)</option>
                            <option value="2560x1440">1440p (2560×1440)</option>
                            <option value="3840x2160">4K (3840×2160)</option>
                        </select>
                    </div>
                </div>

                {/* Duration Settings */}
                <div className="settings-section">
                    <label className="settings-label">Duration</label>
                    <div className="setting-row">
                        <select value={duration} onChange={(e) => setDuration(e.target.value)}>
                            <option value="shortest">Shortest Video</option>
                            <option value="longest">Longest Video</option>
                            <option value="custom">Custom</option>
                        </select>
                    </div>
                    {duration === 'custom' && (
                        <div className="setting-row">
                            <label>Seconds:</label>
                            <input
                                type="number"
                                min="1"
                                max="600"
                                value={customDuration}
                                onChange={(e) => setCustomDuration(Math.max(1, parseInt(e.target.value) || 1))}
                            />
                        </div>
                    )}
                    <div className="info-text">
                        Duration: {formatTime(totalDuration)}
                    </div>
                </div>

                <button
                    className="export-btn"
                    onClick={exportVideo}
                    disabled={videos.length === 0}
                >
                    📥 EXPORT VIDEO
                </button>

                <div className="info-text warning">
                    💡 Tip: Record preview with browser screen capture or OBS Studio
                </div>
            </div>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('app')).render(<App />);
