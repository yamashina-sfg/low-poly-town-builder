// 彩度を抑えた低ポリらしい配色パレット

export const BUILDING_WALL_COLORS = [
  0xd8c9a3, 0xb5533c, 0x8a9a5b, 0x6f8faa, 0xc9a66b, 0x9a8478, 0x7a5c8a, 0xc97a9a, 0x5c8a8a, 0xb08a5c,
];

export const BUILDING_ROOF_COLORS = [0x7a4a3a, 0x5c5c5c, 0x8a6a4a, 0x455a64, 0x5c3a5c, 0x3a5c4a];

export const TRUNK_COLOR = 0x6b4a34;

export const TREE_CONIFER_COLORS = [0x3f6b3a, 0x4a7c3f, 0x2f5730, 0x35684f];

export const TREE_BROADLEAF_COLORS = [0x4a7c3f, 0x6b8e3d, 0xb08a3e, 0xc9a227, 0xd98a3d, 0xa85c3d, 0x8ea23d];

// お店：明るく人目を引く配色
export const SHOP_WALL_COLORS = [0xe8d9a8, 0xaed1e0, 0xcfe0ae, 0xe0b8ae];
export const SHOP_AWNING_COLORS = [0xc94c4c, 0x4c7ac9, 0xc9a94c, 0x4cae7a];

// 井戸：石積みのグレー
export const WELL_STONE_COLORS = [0x9a9a8c, 0x8a8a7c, 0xacac9e];

// 倉庫：実用的な茶〜グレー
export const WAREHOUSE_WALL_COLORS = [0x8a7a5c, 0x6b6b63, 0x7a6a52];

export const WOOD_COLOR = 0x8a5a3c;
export const DARK_METAL_COLOR = 0x3a3a3a;

export const FIREPLACE_STONE_COLOR = 0x7a7a72;
export const FIRE_GLOW_COLOR = 0xff8c3c;

export const LAMP_HEAD_COLOR = 0xfff2b0;

export const FLOWER_COLORS = [0xd9455f, 0xe98bc0, 0x8a5fd9, 0xe9c53f, 0xf2f2f2];
export const SOIL_COLOR = 0x4a3626;

export const SIGN_BOARD_COLOR = 0xd8c9a3;

// 風車：木造の塔＋羽根
export const WINDMILL_TOWER_COLOR = 0xd8c9a3;
export const WINDMILL_BLADE_COLOR = 0xe8e0c9;
export const WINDMILL_ROOF_COLOR = 0x7a4a3a;

// 銅像：緑青がかった石像
export const STATUE_COLOR = 0x7c9a8a;
export const STATUE_BASE_COLOR = 0x9a9a8c;

// 廃墟：自然生成のランドマーク。苔むした灰色
export const RUINS_COLOR = 0x8a8a7c;
export const RUINS_MOSS_COLOR = 0x6b7a5c;

// 特殊な木：資源が豊富な、金色がかった巨木
export const SPECIAL_TREE_TRUNK_COLOR = 0x7a5a3a;
export const SPECIAL_TREE_LEAF_COLOR = 0xc9a227;

// フェーズ25：生産施設（畑・伐採小屋）
export const FARM_CROP_COLORS = [0x6b8e3d, 0xc9a227, 0x8ea23d];
export const LOGGING_HUT_WALL_COLOR = 0x7a5c3f;
export const LOGGING_HUT_ROOF_COLOR = 0x4a3626;
export const LOG_PILE_COLOR = 0x9a6a3f;

// フェーズ25：維持費を払えない建物が老朽化したときに寄せる、くすんだ色。
// 元の色とこの色を条件(condition)に応じて混ぜ合わせることで、
// 完全に元の色味を失わずに「くすんで見える」演出にする。
export const DECAY_TINT_COLOR = 0x3a352c;
