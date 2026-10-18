// ============================================
// FLAPPY WORLD — GAME ENGINE
// ============================================

const $ = (id) => document.getElementById(id);

const gameArea = $("gameArea");
const bird = $("bird");
const scoreElement = $("score");
const bestScoreElement = $("bestScore");
const finalScoreElement = $("finalScore");

const startScreen = $("startScreen");
const gameOverScreen = $("gameOverScreen");

const playBtn = $("playBtn");
const restartBtn = $("restartBtn");

const customizeDialog = $("customizeDialog");
const settingsDialog = $("settingsDialog");

const statusMessage = $("statusMessage");

// --------------------------------------------
// GAME STATE
// --------------------------------------------

let gameRunning = false;
let gameStarted = false;
let animationFrame = null;
let lastFrameTime = 0;

let score = 0;
let birdY = 160;
let birdVelocity = 0;
let obstacles = [];
let nextObstacleId = 0;
let obstacleTimer = 0;

let settings = {
    speed: "fast",
    difficulty: "hard",
    musicEnabled: true,
    soundEnabled: true,
    musicVolume: 0.5,
    soundVolume: 0.7,
    obstacleColor: "#25a55f"
};

const GRAVITY = 0.0015;
const FLAP_POWER = -0.42;
const BIRD_SIZE = 40;
const OBSTACLE_WIDTH = 58;
const GROUND_HEIGHT = 65;

let bestScore = 0;

try {
    bestScore = Number(localStorage.getItem("flappyWorldBest") || 0);
} catch {
    bestScore = 0;
}

bestScoreElement.textContent = bestScore;

// --------------------------------------------
// DEFAULT GAME ELEMENTS
// --------------------------------------------

let characterObjectUrl = null;
let backgroundObjectUrl = null;
let musicObjectUrl = null;
let flapObjectUrl = null;
let collisionObjectUrl = null;
let gameOverObjectUrl = null;

let backgroundMusic = null;

let soundFiles = {
    flap: null,
    collision: null,
    gameOver: null
};

// --------------------------------------------
// SOUND SYSTEM
// --------------------------------------------

let audioContext = null;

function playTone(frequency, duration, type = "sine") {
    if (!settings.soundEnabled || settings.soundVolume <= 0) {
        return;
    }

    try {
        const AudioContextClass =
            window.AudioContext || window.webkitAudioContext;

        if (!AudioContextClass) return;

        audioContext ||= new AudioContextClass();

        if (audioContext.state === "suspended") {
            audioContext.resume();
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.value = frequency;

        gain.gain.setValueAtTime(
            Math.max(0.0001, settings.soundVolume * 0.12),
            audioContext.currentTime
        );

        gain.gain.exponentialRampToValueAtTime(
            0.0001,
            audioContext.currentTime + duration
        );

        oscillator.connect(gain);
        gain.connect(audioContext.destination);

        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
    } catch (error) {
        console.warn("Sound unavailable:", error);
    }
}

function playSound(name) {
    if (!settings.soundEnabled) return;

    const file = soundFiles[name];

    if (file) {
        try {
            const audio = new Audio(file);
            audio.volume = settings.soundVolume;
            audio.play().catch(() => {});
            return;
        } catch {
            // Use the default sound below.
        }
    }

    if (name === "flap") {
        playTone(520, 0.08, "sine");
    } else if (name === "collision") {
        playTone(120, 0.22, "sawtooth");
    } else if (name === "gameOver") {
        playTone(180, 0.35, "triangle");
    }
}

function startMusic() {
    if (!backgroundMusic || !settings.musicEnabled) return;

    backgroundMusic.volume = settings.musicVolume;

    backgroundMusic.play().catch(() => {
        // Browsers require a user interaction before audio playback.
    });
}

function stopMusic() {
    if (backgroundMusic) {
        backgroundMusic.pause();
    }
}

// --------------------------------------------
// CHARACTER
// --------------------------------------------

function renderBird() {
    bird.style.top = `${birdY}px`;
}

function flap() {
    if (!gameRunning) return;

    birdVelocity = FLAP_POWER;
    bird.style.transform = "rotate(-20deg)";

    playSound("flap");
}

// --------------------------------------------
// GAME START / RESTART
// --------------------------------------------

function startGame() {
    if (gameRunning) return;

    cancelAnimationFrame(animationFrame);

    score = 0;
    birdY = Math.max(
        30,
        Math.min(160, gameArea.clientHeight * 0.4)
    );

    birdVelocity = 0;
    obstacleTimer = 0;
    lastFrameTime = 0;
    obstacles = [];
    nextObstacleId = 0;

    gameArea.querySelectorAll(".obstacle").forEach((element) => {
        element.remove();
    });

    scoreElement.textContent = "0";

    startScreen.hidden = true;
    gameOverScreen.hidden = true;

    bird.style.display = "flex";
    bird.style.left = `${gameArea.clientWidth * 0.25}px`;

    renderBird();

    gameRunning = true;
    gameStarted = true;

    startMusic();

    animationFrame = requestAnimationFrame(gameLoop);
}

function endGame() {
    if (!gameRunning) return;

    gameRunning = false;

    cancelAnimationFrame(animationFrame);
    stopMusic();

    playSound("collision");
    playSound("gameOver");

    finalScoreElement.textContent = score;
    gameOverScreen.hidden = false;

    if (score > bestScore) {
        bestScore = score;
        bestScoreElement.textContent = bestScore;

        try {
            localStorage.setItem("flappyWorldBest", String(bestScore));
        } catch {
            // The game still works if local storage is unavailable.
        }
    }
}

// --------------------------------------------
// OBSTACLES
// --------------------------------------------

function getGapSize() {
    if (settings.difficulty === "easy") return 185;
    if (settings.difficulty === "hard") return 125;

    return 155;
}

function getObstacleSpeed() {
    if (settings.speed === "slow") return 0.12;
    if (settings.speed === "fast") return 0.27;

    return 0.19;
}

function createObstacle() {
    const areaHeight = gameArea.clientHeight;
    const groundTop = areaHeight - GROUND_HEIGHT;
    const gap = getGapSize();

    const margin = 45;
    const availableHeight = groundTop - gap - margin * 2;

    if (availableHeight <= 0) return;

    const gapTop =
        margin + Math.random() * availableHeight;

    const obstacle = {
        id: nextObstacleId++,
        x: gameArea.clientWidth + 10,
        gapTop,
        gapBottom: gapTop + gap,
        passed: false
    };

    const topPipe = document.createElement("div");
    topPipe.className = "obstacle";
    topPipe.style.position = "absolute";
    topPipe.style.left = `${obstacle.x}px`;
    topPipe.style.top = "0";
    topPipe.style.width = `${OBSTACLE_WIDTH}px`;
    topPipe.style.height = `${gapTop}px`;
    topPipe.style.background = settings.obstacleColor;
    topPipe.style.border = "3px solid rgba(0,0,0,0.15)";
    topPipe.style.borderRadius = "5px";

    const bottomPipe = document.createElement("div");
    bottomPipe.className = "obstacle";
    bottomPipe.style.position = "absolute";
    bottomPipe.style.left = `${obstacle.x}px`;
    bottomPipe.style.top = `${obstacle.gapBottom}px`;
    bottomPipe.style.width = `${OBSTACLE_WIDTH}px`;
    bottomPipe.style.height =
        `${Math.max(0, groundTop - obstacle.gapBottom)}px`;
    bottomPipe.style.background = settings.obstacleColor;
    bottomPipe.style.border = "3px solid rgba(0,0,0,0.15)";
    bottomPipe.style.borderRadius = "5px";

    gameArea.append(topPipe, bottomPipe);

    obstacle.topElement = topPipe;
    obstacle.bottomElement = bottomPipe;

    obstacles.push(obstacle);
}

// --------------------------------------------
// COLLISION DETECTION
// --------------------------------------------

function checkCollision(obstacle) {
    const birdLeft = gameArea.clientWidth * 0.25;
    const birdRight = birdLeft + BIRD_SIZE;
    const birdTop = birdY;
    const birdBottom = birdY + BIRD_SIZE;

    const obstacleLeft = obstacle.x;
    const obstacleRight = obstacle.x + OBSTACLE_WIDTH;

    const horizontalOverlap =
        birdRight > obstacleLeft &&
        birdLeft < obstacleRight;

    if (!horizontalOverlap) return false;

    return (
        birdTop < obstacle.gapTop ||
        birdBottom > obstacle.gapBottom
    );
}

// --------------------------------------------
// SCORE
// --------------------------------------------

function increaseScore(obstacle) {
    if (obstacle.passed) return;

    const birdLeft = gameArea.clientWidth * 0.25;

    if (obstacle.x + OBSTACLE_WIDTH < birdLeft) {
        obstacle.passed = true;

        score++;
        scoreElement.textContent = score;

        playTone(850, 0.07, "sine");
    }
}

// --------------------------------------------
// MAIN GAME LOOP
// --------------------------------------------

function gameLoop(timestamp) {
    if (!gameRunning) return;

    if (!lastFrameTime) lastFrameTime = timestamp;

    const delta = Math.min(timestamp - lastFrameTime, 32);
    lastFrameTime = timestamp;

    const areaHeight = gameArea.clientHeight;
    const groundTop = areaHeight - GROUND_HEIGHT;

    birdVelocity += GRAVITY * delta;
    birdY += birdVelocity * delta;

    bird.style.transform =
        `rotate(${Math.min(70, Math.max(-25, birdVelocity * 80))}deg)`;

    renderBird();

    if (birdY < 0 || birdY + BIRD_SIZE > groundTop) {
        endGame();
        return;
    }

    obstacleTimer += delta;

    if (obstacleTimer >= 1450) {
        obstacleTimer = 0;
        createObstacle();
    }

    const obstacleSpeed = getObstacleSpeed() * delta;

    obstacles.forEach((obstacle) => {
        obstacle.x -= obstacleSpeed;

        obstacle.topElement.style.left = `${obstacle.x}px`;
        obstacle.bottomElement.style.left = `${obstacle.x}px`;

        if (checkCollision(obstacle)) {
            endGame();
            return;
        }

        increaseScore(obstacle);
    });

    if (!gameRunning) return;

    obstacles = obstacles.filter((obstacle) => {
        if (obstacle.x + OBSTACLE_WIDTH < 0) {
            obstacle.topElement.remove();
            obstacle.bottomElement.remove();
            return false;
        }

        return true;
    });

    animationFrame = requestAnimationFrame(gameLoop);
}

// --------------------------------------------
// BUTTONS
// --------------------------------------------

playBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);

gameArea.addEventListener("pointerdown", (event) => {
    if (
        event.target.closest("button") ||
        event.target.closest(".start-screen") ||
        event.target.closest(".game-over-screen")
    ) {
        return;
    }

    if (gameRunning) {
        flap();
    }
});

document.addEventListener("keydown", (event) => {
    if (
        event.code !== "Space" &&
        event.code !== "ArrowUp"
    ) {
        return;
    }

    if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement ||
        event.target instanceof HTMLTextAreaElement
    ) {
        return;
    }

    if (customizeDialog.open || settingsDialog.open) return;

    event.preventDefault();

    if (!gameStarted || !gameRunning) {
        if (gameOverScreen.hidden) {
            startGame();
        }

        return;
    }

    flap();
});

// --------------------------------------------
// OPEN / CLOSE DIALOGS
// --------------------------------------------

$("customizeBtn").addEventListener("click", () => {
    customizeDialog.showModal();
});

$("settingsBtn").addEventListener("click", () => {
    settingsDialog.showModal();
});

document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => {
        $(button.dataset.close).close();
    });
});

// --------------------------------------------
// FILE UPLOAD PREVIEW
// --------------------------------------------

function readFileAsObjectUrl(file, allowedTypes) {
    if (!file) return null;

    if (!allowedTypes.some((type) => file.type.startsWith(type))) {
        statusMessage.textContent = "Please choose a supported file.";
        return null;
    }

    const maxSize = 15 * 1024 * 1024;

    if (file.size > maxSize) {
        statusMessage.textContent = "File must be smaller than 15 MB.";
        return null;
    }

    return URL.createObjectURL(file);
}

function replaceObjectUrl(oldUrl, newUrl) {
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    return newUrl;
}

$("characterFile").addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (!file) return;

    const url = readFileAsObjectUrl(file, ["image/"]);

    if (!url) return;

    characterObjectUrl = replaceObjectUrl(characterObjectUrl, url);

    bird.textContent = "";
    bird.style.backgroundImage = `url("${characterObjectUrl}")`;
    bird.style.backgroundSize = "contain";
    bird.style.backgroundPosition = "center";
    bird.style.backgroundRepeat = "no-repeat";
});

$("backgroundFile").addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (!file) return;

    const url = readFileAsObjectUrl(file, ["image/"]);

    if (!url) return;

    backgroundObjectUrl = replaceObjectUrl(backgroundObjectUrl, url);

    gameArea.style.backgroundImage = `url("${backgroundObjectUrl}")`;
    gameArea.style.backgroundSize = "cover";
    gameArea.style.backgroundPosition = "center";
});

$("obstacleColor").addEventListener("input", (event) => {
    settings.obstacleColor = event.target.value;
});

// --------------------------------------------
// AUDIO UPLOADS
// --------------------------------------------

function loadAudioFile(file, oldUrl, callback) {
    const url = readFileAsObjectUrl(file, ["audio/"]);

    if (!url) return oldUrl;

    const newUrl = replaceObjectUrl(oldUrl, url);

    callback(newUrl);

    return newUrl;
}

$("musicFile").addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (!file) return;

    musicObjectUrl = loadAudioFile(
        file,
        musicObjectUrl,
        (url) => {
            if (backgroundMusic) {
                backgroundMusic.pause();
            }

            backgroundMusic = new Audio(url);
            backgroundMusic.loop = true;
            backgroundMusic.volume = settings.musicVolume;

            startMusic();
        }
    );
});

$("flapFile").addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (!file) return;

    flapObjectUrl = loadAudioFile(
        file,
        flapObjectUrl,
        (url) => {
            soundFiles.flap = url;
        }
    );
});

$("collisionFile").addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (!file) return;

    collisionObjectUrl = loadAudioFile(
        file,
        collisionObjectUrl,
        (url) => {
            soundFiles.collision = url;
        }
    );
});

$("gameOverFile").addEventListener("change", (event) => {
    const file = event.target.files[0];

    if (!file) return;

    gameOverObjectUrl = loadAudioFile(
        file,
        gameOverObjectUrl,
        (url) => {
            soundFiles.gameOver = url;
        }
    );
});

// --------------------------------------------
// VOLUME CONTROLS
// --------------------------------------------

$("musicVolume").addEventListener("input", (event) => {
    settings.musicVolume = Number(event.target.value) / 100;

    $("musicVolumeValue").textContent =
        `${event.target.value}%`;

    if (backgroundMusic) {
        backgroundMusic.volume = settings.musicVolume;
    }
});

$("soundVolume").addEventListener("input", (event) => {
    settings.soundVolume = Number(event.target.value) / 100;

    $("soundVolumeValue").textContent =
        `${event.target.value}%`;
});

// --------------------------------------------
// SAVE CUSTOMIZATION
// --------------------------------------------

$("saveCustomizationBtn").addEventListener("click", () => {
    statusMessage.textContent =
        "Customization applied for this session.";

    customizeDialog.close();
});

// --------------------------------------------
// SETTINGS
// --------------------------------------------



$("gameSpeed").addEventListener("change", (event) => {
    settings.speed = event.target.value;
});

$("difficulty").addEventListener("change", (event) => {
    settings.difficulty = event.target.value;
});

$("saveSettingsBtn").addEventListener("click", () => {
    try {
        localStorage.setItem(
            "flappyWorldSettings",
            JSON.stringify(settings)
        );
    } catch {
        // Settings remain active for the current session.
    }

    statusMessage.textContent = "Settings saved on this browser.";

    settingsDialog.close();
});
// Only Fast speed and Hard difficulty are available.
settings.speed = "fast";
settings.difficulty = "hard";

$("gameSpeed").value = "fast";
$("difficulty").value = "hard";
// --------------------------------------------
// LOAD SETTINGS
// --------------------------------------------

try {
    const savedSettings =
        JSON.parse(localStorage.getItem("flappyWorldSettings") || "{}");



    $("obstacleColor").value = settings.obstacleColor;

    $("musicVolume").value = settings.musicVolume * 100;
    $("soundVolume").value = settings.soundVolume * 100;

    $("musicVolumeValue").textContent =
        `${Math.round(settings.musicVolume * 100)}%`;

    $("soundVolumeValue").textContent =
        `${Math.round(settings.soundVolume * 100)}%`;
} catch {
    // Default settings are already configured.
}

// --------------------------------------------
// SHARE BUTTON - UNIQUE GAME LINK
// --------------------------------------------

$("shareBtn").addEventListener("click", async () => {
    try {
        const { data: sessionData, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        const user = sessionData.session?.user;

        if (!user) {
            statusMessage.textContent =
                "Please log in to share your saved game.";
            return;
        }

        // Get the user's saved games
        const { data: games, error } = await supabaseClient
            .from("games")
            .select("id, title")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!games || games.length === 0) {
            statusMessage.textContent =
                "Please save a game before sharing it.";
            return;
        }

        // If only one game exists, share it directly
        let selectedGame;

        if (games.length === 1) {
            selectedGame = games[0];
        } else {
            const choice = prompt(
                "Enter the number of the game to share:\n" +
                games.map((game, index) =>
                    `${index + 1}. ${game.title}`
                ).join("\n")
            );

            if (choice === null) return;

            const index = Number(choice) - 1;

            if (!Number.isInteger(index) ||
                index < 0 ||
                index >= games.length) {
                statusMessage.textContent =
                    "Invalid game selection.";
                return;
            }

            selectedGame = games[index];
        }

        // Create a unique link for this saved game
        const shareURL = new URL(window.location.href);
        shareURL.searchParams.set("game", selectedGame.id);

        const shareData = {
            title: selectedGame.title || "Flappy World",
            text: "Come play my Flappy World game!",
            url: shareURL.href
        };

        if (navigator.share) {
            await navigator.share(shareData);
       } else {
    window.prompt(
        "Copy your unique game link below:",
        shareURL.href
    );
}

    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Share error:", error);
            statusMessage.textContent =
                "Unable to share: " + error.message;
        }
    }
});

// --------------------------------------------
// COMMUNITY PLACEHOLDER
// --------------------------------------------

$("myGamesBtn").addEventListener("click", () => {
    statusMessage.textContent =
        "Community Games will be connected to Supabase in a later step.";
});

// --------------------------------------------
// INITIAL STATE
// --------------------------------------------

bird.style.display = "none";

console.log("Flappy World game engine loaded successfully!");
// ============================================
// FLAPPY WORLD — AUTHENTICATION
// ============================================

let authMode = "login";

const authDialog = document.getElementById("authDialog");
const authTitle = document.getElementById("authTitle");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authMessage = document.getElementById("authMessage");

const loginBtn = document.getElementById("loginBtn");
const signupBtn = document.getElementById("signupBtn");
const logoutBtn = document.getElementById("logoutBtn");

function openAuthDialog(mode) {
    authMode = mode;

    authTitle.textContent =
        mode === "signup" ? "Create Account" : "Login";

    authSubmitBtn.textContent =
        mode === "signup" ? "SIGN UP" : "LOGIN";

    authPassword.autocomplete =
        mode === "signup" ? "new-password" : "current-password";

    authMessage.textContent = "";
    authEmail.value = "";
    authPassword.value = "";

    authDialog.showModal();
}

loginBtn.addEventListener("click", () => {
    openAuthDialog("login");
});

signupBtn.addEventListener("click", () => {
    openAuthDialog("signup");
});

authSubmitBtn.addEventListener("click", async () => {
    const email = authEmail.value.trim();
    const password = authPassword.value;

    if (!email || !password) {
        authMessage.textContent = "Please enter email and password.";
        return;
    }

    if (password.length < 6) {
        authMessage.textContent =
            "Password must contain at least 6 characters.";
        return;
    }

    authSubmitBtn.disabled = true;
    authMessage.textContent = "Please wait...";

    try {
        let result;

        if (authMode === "signup") {
            result = await supabaseClient.auth.signUp({
                email,
                password
            });
        } else {
            result = await supabaseClient.auth.signInWithPassword({
                email,
                password
            });
        }

        if (result.error) {
            throw result.error;
        }

        if (
            authMode === "signup" &&
            !result.data.session
        ) {
            authMessage.textContent =
                "Account created! Check your email to confirm your account.";
            return;
        }

        authDialog.close();
        authMessage.textContent = "";

        statusMessage.textContent =
            authMode === "signup"
                ? "Account created successfully!"
                : "Login successful!";

        updateAuthUI();
    } catch (error) {
        authMessage.textContent = error.message;
    } finally {
        authSubmitBtn.disabled = false;
    }
});

logoutBtn.addEventListener("click", async () => {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
        statusMessage.textContent = error.message;
        return;
    }

    statusMessage.textContent = "Logged out successfully.";
    updateAuthUI();
});

async function updateAuthUI() {
    try {
        const { data, error } =
            await supabaseClient.auth.getSession();

        if (error) {
            throw error;
        }

        const loggedIn = Boolean(data?.session?.user);

        loginBtn.hidden = loggedIn;
        signupBtn.hidden = loggedIn;
        logoutBtn.hidden = !loggedIn;

    } catch (error) {
        console.error("Auth status error:", error.message);

        loginBtn.hidden = false;
        signupBtn.hidden = false;
        logoutBtn.hidden = true;
    }
}
supabaseClient.auth.onAuthStateChange(() => {
    updateAuthUI();
});

updateAuthUI();

console.log("Flappy World authentication initialized.");
// ================================
// SAVE GAME TO SUPABASE
// ================================

const saveGameBtn = document.getElementById("saveGameBtn");

saveGameBtn.addEventListener("click", async () => {
    try {
        // Check login
        const { data: sessionData, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        const user = sessionData.session?.user;

        if (!user) {
            statusMessage.textContent =
                "Please log in before saving your game.";
            return;
        }

        saveGameBtn.disabled = true;
        statusMessage.textContent = "Saving your game...";

        // Save game settings
        const gameData = {
            owner_id: user.id,
            title: "My Flappy Game",
            settings: settings,
            is_public: false
        };

        const { data, error } = await supabaseClient
            .from("games")
            .insert(gameData)
            .select()
            .single();

        if (error) throw error;

        statusMessage.textContent =
            "Game saved successfully! 🎉";

        console.log("Saved game:", data);

    } catch (error) {
        console.error("Save game error:", error);

        statusMessage.textContent =
            "Could not save game: " + error.message;

    } finally {
        saveGameBtn.disabled = false;
    }
});

console.log("Save Game feature initialized.");
// ================================
// MY GAMES - LOAD SAVED GAMES
// ================================

const myGamesBtn = document.getElementById("myGamesBtn");
const myGamesList = document.getElementById("myGamesList");

myGamesBtn.addEventListener("click", async () => {
    myGamesList.style.display = "block";
    myGamesList.innerHTML = "<p>Loading your games...</p>";

    try {
        const { data: sessionData, error: sessionError } =
            await supabaseClient.auth.getSession();

        if (sessionError) throw sessionError;

        const user = sessionData.session?.user;

        if (!user) {
            myGamesList.innerHTML =
                "<p>Please log in to view your saved games.</p>";
            return;
        }

        const { data: games, error } = await supabaseClient
            .from("games")
            .select("id, title, settings, created_at")
            .eq("owner_id", user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        if (!games || games.length === 0) {
            myGamesList.innerHTML =
                "<p>You haven't saved any games yet.</p>";
            return;
        }

        myGamesList.innerHTML = `
            <h2>📂 My Games</h2>
            <div id="savedGamesContainer"></div>
        `;

        const container =
            document.getElementById("savedGamesContainer");

        games.forEach((game) => {
            const card = document.createElement("div");

            card.style.cssText = `
                background: #211b35;
                padding: 16px;
                margin: 12px 0;
                border-radius: 12px;
                border: 1px solid #51416e;
            `;

            const title = document.createElement("h3");
            title.textContent = game.title;

            const date = document.createElement("p");
            date.textContent =
                "Saved: " +
                new Date(game.created_at).toLocaleDateString();

            const details = document.createElement("p");
            details.textContent =
                "Speed: " + (game.settings?.speed || "fast") +
                " | Difficulty: " +
                (game.settings?.difficulty || "hard");

            const loadButton = document.createElement("button");
            loadButton.textContent = "Load Settings";
            loadButton.type = "button";

            loadButton.addEventListener("click", () => {
                Object.assign(settings, game.settings || {});

                statusMessage.textContent =
                    "Settings loaded! 🎮";

                myGamesList.style.display = "none";

                console.log("Loaded game:", game.id, settings);
            });

            card.append(title, date, details, loadButton);
            container.appendChild(card);
        });

    } catch (error) {
        console.error("My Games error:", error);

        myGamesList.innerHTML =
            "<p>Could not load games: " +
            error.message.replace(/[&<>"]/g, char => ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;"
            })[char]) +
            "</p>";
    }
});

console.log("My Games feature initialized.");