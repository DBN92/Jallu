import { describe, expect, it } from 'vitest';
import type { PersonDto } from '@luna/shared/types';
import { greetNames } from './PeopleCard';

const p = (name: string, home: boolean, since: string | null): PersonDto => ({ id: `person.${name.toLowerCase()}`, name, home, place: home ? 'Em casa' : 'Fora', since, picture: false });

describe('greetNames', () => {
  it('cumprimenta todos em casa, quem chegou por último primeiro', () => {
    expect(greetNames([p('Daniel Bezerra', true, '2026-11-15T10:00:00Z'), p('Natália', true, '2026-11-15T18:00:00Z'), p('Ana', false, null)], 'Daniel')).toBe('Natália e Daniel');
  });
  it('três pessoas em casa', () => {
    expect(greetNames([p('Daniel', true, '2026-11-15T10:00:00Z'), p('Natália', true, '2026-11-15T09:00:00Z'), p('Luiza', true, '2026-11-15T11:00:00Z')], 'Daniel')).toBe('Luiza, Daniel e Natália');
  });
  it('sem ninguém em casa ou sem pessoas no Home Assistant, usa quem entrou no app', () => {
    expect(greetNames([p('Natália', false, null)], 'Daniel')).toBe('Daniel');
    expect(greetNames(null, 'Daniel')).toBe('Daniel');
  });
});
