export function repositoryDownloadFolderName(repositoryName: string): string {
  return repositoryName.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/[. ]+$/, '') || 'repository';
}

export function branchDownloadFolderName(branch: string, visibleBranchCount: number): string {
  if (visibleBranchCount === 1) return '';
  const encoder = new TextEncoder();
  let candidate = branch.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(candidate)) candidate = `_${candidate}`;
  let folder = '', bytes = 0;
  for (const character of candidate) {
    bytes += encoder.encode(character).length;
    if (bytes > 160) break;
    folder += character;
  }
  return folder.replace(/[. ]+$/, '') || 'branch';
}

export function isDownloadFolderName(value: string): boolean {
  return value.length > 0 && new TextEncoder().encode(value).length <= 160 && !value.startsWith('.') &&
    !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !/[. ]$/.test(value) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
}
