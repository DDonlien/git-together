import { FileJsIcon } from '@phosphor-icons/react/dist/csr/FileJs';
import { FileTsIcon } from '@phosphor-icons/react/dist/csr/FileTs';
import { FileCssIcon } from '@phosphor-icons/react/dist/csr/FileCss';
import { FileHtmlIcon } from '@phosphor-icons/react/dist/csr/FileHtml';
import { FileRsIcon } from '@phosphor-icons/react/dist/csr/FileRs';
import { FileZipIcon } from '@phosphor-icons/react/dist/csr/FileZip';
import { FilePdfIcon } from '@phosphor-icons/react/dist/csr/FilePdf';
import { FileAudioIcon } from '@phosphor-icons/react/dist/csr/FileAudio';
import { FileVideoIcon } from '@phosphor-icons/react/dist/csr/FileVideo';
import { FileTextIcon } from '@phosphor-icons/react/dist/csr/FileText';
import { BracketsCurlyIcon } from '@phosphor-icons/react/dist/csr/BracketsCurly';
import { Icon } from './ui';

const sourceIcons = { js: FileJsIcon, jsx: FileJsIcon, mjs: FileJsIcon, cjs: FileJsIcon, ts: FileTsIcon, tsx: FileTsIcon, css: FileCssIcon, scss: FileCssIcon, html: FileHtmlIcon, htm: FileHtmlIcon, rs: FileRsIcon, zip: FileZipIcon, gz: FileZipIcon, tar: FileZipIcon, '7z': FileZipIcon, rar: FileZipIcon, pdf: FilePdfIcon, mp3: FileAudioIcon, wav: FileAudioIcon, flac: FileAudioIcon, ogg: FileAudioIcon, mp4: FileVideoIcon, mov: FileVideoIcon, webm: FileVideoIcon, json: BracketsCurlyIcon, jsonc: BracketsCurlyIcon, txt: FileTextIcon, log: FileTextIcon } as const;

export function FileTypeIcon({ path, directory = false, link = false }: { path: string; directory?: boolean; link?: boolean }) {
  if (directory) return <Icon name="folder" size={16} />;
  if (link) return <Icon name="external" size={16} />;
  const name = path.split('/').pop()!.toLowerCase(), extension = name.split('.').pop();
  if (['.gitignore', '.gitattributes', '.gitmodules'].includes(name)) return <Icon name="branch" size={16} />;
  if (/\.(md|mdx|markdown|rst)$/.test(name)) return <Icon name="book" size={16} />;
  if (/\.(png|jpe?g|gif|webp|svg|ico|icns|avif|bmp|tiff?)$/.test(name)) return <Icon name="image" size={16} />;
  if (/\.(blend|fbx|obj|gltf|glb|uasset|umap)$/.test(name)) return <Icon name="cube" size={16} />;
  const component = extension && extension in sourceIcons ? sourceIcons[extension as keyof typeof sourceIcons] : undefined;
  if (component) { const Component = component; return <Component size={16} aria-hidden="true" />; }
  if (/\.(toml|ya?ml|ini|cfg|conf|env|xml)$/.test(name) || name.startsWith('.env') || ['dockerfile', 'makefile', 'cmakelists.txt'].includes(name)) return <Icon name="settings" size={16} />;
  if (/\.(py|swift|c|h|cpp|hpp|cs|java|kt|go|sh|bat|ps1|vue|svelte|sql|rb|php)$/.test(name)) return <Icon name="code" size={16} />;
  return <Icon name="file" size={16} />;
}
