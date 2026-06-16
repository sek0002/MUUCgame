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

declare global {
  interface Window {
    getGameRenderHeight?: () => number;
    setGameRenderHeight?: (height: number) => number;
  }
}

const fullscreenDocument = document as WebkitFullscreenDocument;

const fullscreenElement = () =>
  document.fullscreenElement ?? fullscreenDocument.webkitFullscreenElement ?? null;

const DEFAULT_DESKTOP_RENDER_HEIGHT = 720;
const DEFAULT_MOBILE_RENDER_HEIGHT = 480;
const MIN_RENDER_HEIGHT = 360;
const MAX_RENDER_HEIGHT = 1080;
const MIN_RENDER_WIDTH = 360;

const isMobileRenderTarget = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;
const maxRenderHeight = () => (isMobileRenderTarget() ? DEFAULT_MOBILE_RENDER_HEIGHT : MAX_RENDER_HEIGHT);
const clampRenderHeight = (height: number) =>
  Phaser.Math.Clamp(Math.round(height), MIN_RENDER_HEIGHT, maxRenderHeight());

const defaultRenderHeight = () => (
  isMobileRenderTarget() ? DEFAULT_MOBILE_RENDER_HEIGHT : DEFAULT_DESKTOP_RENDER_HEIGHT
);

let renderHeight = clampRenderHeight(defaultRenderHeight());

const getRenderSize = () => {
  renderHeight = clampRenderHeight(renderHeight);
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);

  return {
    width: Math.max(MIN_RENDER_WIDTH, Math.round(renderHeight * aspect)),
    height: renderHeight,
  };
};

const initialRenderSize = getRenderSize();

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
    mode: Phaser.Scale.FIT,
    width: initialRenderSize.width,
    height: initialRenderSize.height,
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

const game = new Phaser.Game(config);

window.setGameRenderHeight = (height: number) => {
  renderHeight = clampRenderHeight(height);
  const nextRenderSize = getRenderSize();
  game.scale.setGameSize(nextRenderSize.width, nextRenderSize.height);
  return renderHeight;
};
window.getGameRenderHeight = () => renderHeight;

window.addEventListener("resize", () => {
  renderHeight = clampRenderHeight(renderHeight);
  const nextRenderSize = getRenderSize();
  game.scale.setGameSize(nextRenderSize.width, nextRenderSize.height);
});

initializeFullscreenToggle();
