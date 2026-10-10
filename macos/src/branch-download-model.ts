export function branchDownloadFolderName(repositoryName: string, branch: string): string {
  return `${repositoryName}-${branch}`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 160).replace(/[. ]+$/, '') || 'branch';
}

export function isDownloadFolderName(value: string): boolean {
  return value.length > 0 && value.length <= 160 && value !== '.' && value !== '..' &&
    !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !/[. ]$/.test(value);
}
