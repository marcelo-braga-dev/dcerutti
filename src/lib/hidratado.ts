'use client';

import { useSyncExternalStore } from 'react';

const nada = () => () => {};

/** false no servidor e durante a hidratação; true depois. Evita divergência com dados do navegador (localStorage). */
export const useHidratado = () => useSyncExternalStore(nada, () => true, () => false);
