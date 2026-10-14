export function repositoryDownloadFolderName(repositoryName: string): string {
  return repositoryName.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/[. ]+$/, '') || 'repository';
}

export function branchDownloadFolderName(repositoryName: string, branch: string): string {
  return `${repositoryDownloadFolderName(repositoryName)}_${branch}`.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').slice(0, 160).replace(/[. ]+$/, '') || 'branch';
}

export function isDownloadFolderName(value: string): boolean {
  return value.length > 0 && value.length <= 160 && value !== '.' && value !== '..' &&
    !/[\\/:*?"<>|\x00-\x1f]/.test(value) && !/[. ]$/.test(value);
}
