export const CREATURES = {
  hero: {
    key: "port-jackson",
    url: "/assets/creatures/port jackson.svg",
  },
  blueDevil: {
    key: "blue-devil",
    url: "/assets/creatures/blue devil.svg",
  },
  crayfish: {
    key: "crayfish",
    url: "/assets/creatures/crayfish.svg",
  },
  muuc: {
    key: "muuc",
    url: "/assets/creatures/muuc.svg",
  },
  nudhhi: {
    key: "nudhhi",
    url: "/assets/creatures/nudhhi.svg",
  },
  seadragon: {
    key: "seadragon",
    url: "/assets/creatures/seadragon.svg",
  },
  stingray: {
    key: "smooth-sting-ray",
    url: "/assets/creatures/smooth sting ray.svg",
  },
} as const;

export const NPC_CREATURES = [
  CREATURES.blueDevil,
  CREATURES.crayfish,
  CREATURES.nudhhi,
  CREATURES.seadragon,
  CREATURES.stingray,
] as const;
