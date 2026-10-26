import pkg from '../package.json';

export const productVersion: string = import.meta.env.VITE_GITTOGETHER_VERSION || pkg.version;
