export const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

export const CREATURES = {
  hero: {
    key: "port-jackson",
    url: assetUrl("/assets/creatures/port jackson.svg"),
  },
  blueDevil: {
    key: "blue-devil",
    url: assetUrl("/assets/creatures/blue devil.svg"),
  },
  crayfish: {
    key: "crayfish",
    url: assetUrl("/assets/creatures/crayfish.svg"),
  },
  muuc: {
    key: "muuc",
    url: assetUrl("/assets/creatures/muuc.svg"),
  },
  nudhhi: {
    key: "nudhhi",
    url: assetUrl("/assets/creatures/nudhhi.svg"),
  },
  seadragon: {
    key: "seadragon",
    url: assetUrl("/assets/creatures/seadragon.svg"),
  },
  stingray: {
    key: "smooth-sting-ray",
    url: assetUrl("/assets/creatures/smooth sting ray.svg"),
  },
} as const;

export const NPC_CREATURES = [
  CREATURES.blueDevil,
  CREATURES.crayfish,
  CREATURES.nudhhi,
  CREATURES.seadragon,
  CREATURES.stingray,
] as const;
