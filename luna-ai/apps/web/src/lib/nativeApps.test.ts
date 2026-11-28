import { describe, expect, it } from 'vitest';
import { defaultApps, type NativeApp } from './nativeApps';

const app = (pkg: string, label: string): NativeApp => ({ pkg, label, icon: null, banner: null });

describe('atalhos de aplicativos (TV)', () => {
  it('escolhe YouTube, Prime Video, Netflix e Claro tv+ pelo nome, se estiverem instalados', () => {
    const all = [app('a.kids', 'YouTube Kids'), app('a.yt', 'YouTube'), app('a.nf', 'Netflix'), app('a.pv', 'Prime Video'), app('a.cl', 'Claro tv+'), app('a.x', 'Spotify')];
    expect(defaultApps(all)).toEqual(['a.yt', 'a.pv', 'a.nf', 'a.cl']);
    expect(defaultApps([app('a.nf', 'Netflix')])).toEqual(['a.nf']);
  });
});
