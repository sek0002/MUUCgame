import Phaser from "phaser";
import { OceanScene } from "./scenes/OceanScene";
import "./styles.css";

type WebkitFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
};

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

const fullscreenDocument = document as WebkitFullscreenDocument;

const fullscreenElement = () =>
  document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;

const initializeFullscreenToggle = () => {
  const button = document.getElementById("fullscreen-toggle");
  if (!(button instanceof HTMLButtonElement)) return;

  const target = (document.getElementById("app") ?? document.documentElement) as WebkitFullscreenElement;
  const requestFullscreen = target.requestFullscreen?.bind(target) ?? target.webkitRequestFullscreen?.bind(target);
  const exitFullscreen = document.exitFullscreen?.bind(document) ?? fullscreenDocument.webkitExitFullscreen?.bind(document);

  if (!requestFullscreen || !exitFullscreen) {
    button.hidden = true;
    return;
  }

  const updateButton = () => {
    const isFullscreen = Boolean(fullscreenElement());
    button.setAttribute("aria-pressed", String(isFullscreen));
    button.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
    button.title = isFullscreen ? "Exit fullscreen" : "Fullscreen";
  };

  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();

    try {
      if (fullscreenElement()) {
        await exitFullscreen();
      } else {
        await requestFullscreen();
      }
    } catch {
      updateButton();
    }
  });

  document.addEventListener("fullscreenchange", updateButton);
  document.addEventListener("webkitfullscreenchange", updateButton);
  updateButton();
};

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.CANVAS,
  parent: "game-root",
  backgroundColor: "#08283a",
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [OceanScene],
};

new Phaser.Game(config);
initializeFullscreenToggle();
