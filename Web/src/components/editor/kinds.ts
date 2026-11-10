const KIND_NAMES = { door: 'External door', window: 'Window', skylight: 'Skylight' } as const

/** What a room can have in its outside walls and roof. */
export type ItemKind = keyof typeof KIND_NAMES

export const kindName = (kind: ItemKind) => KIND_NAMES[kind]
