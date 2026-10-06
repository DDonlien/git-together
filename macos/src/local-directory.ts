export type DirectoryChooser = () => Promise<string | null>;

export async function chooseLocalDirectory(chooser: DirectoryChooser | undefined = typeof window === 'undefined' ? undefined : window.gittogether?.chooseDirectory): Promise<string | null> {
  if (!chooser) throw new Error('浏览器预览尚未接入系统文件夹选择器，请使用桌面版。');
  let selected: unknown;
  try { selected = await chooser(); }
  catch { throw new Error('无法打开系统文件夹选择器，请重试。'); }
  if (selected === null) return null;
  // Only a native absolute path can be passed to the existing Git validator.
  // Browser file inputs expose names or fake paths, not a working directory.
  if (typeof selected !== 'string' || selected.includes('\0') || !(/^(\/|[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+)/i.test(selected))) throw new Error('文件夹选择结果无效，请重新选择。');
  return selected;
}
