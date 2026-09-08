import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Equivalent of the Rust `directories` crate's
 * `ProjectDirs::from("com", "NerdyPepper", "eva")`, so the JavaScript port
 * shares its history file with the original binary.
 *
 * @returns {{ dataDir: string, cacheDir: string }}
 */
export function projectDirs() {
  const home = homedir();
  switch (process.platform) {
    case 'darwin':
      return {
        dataDir: join(home, 'Library', 'Application Support', 'com.NerdyPepper.eva'),
        cacheDir: join(home, 'Library', 'Caches', 'com.NerdyPepper.eva'),
      };
    case 'win32': {
      const appData = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
      const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local');
      return {
        dataDir: join(appData, 'NerdyPepper', 'eva', 'data'),
        cacheDir: join(localAppData, 'NerdyPepper', 'eva', 'cache'),
      };
    }
    default: {
      const xdgData = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
      const xdgCache = process.env.XDG_CACHE_HOME || join(home, '.cache');
      return { dataDir: join(xdgData, 'eva'), cacheDir: join(xdgCache, 'eva') };
    }
  }
}
