import {
  ConflictedFileStatus,
  isConflictWithMarkers,
  WorkingDirectoryStatus,
} from '../../models/status'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { getUnmergedFiles, isConflictedFile } from '../../lib/status'

/** Display a file as resolved only after a choice or a known zero marker count. */
export function isConflictResolved(
  status: ConflictedFileStatus,
  manualResolution?: ManualConflictResolution
): boolean {
  return (
    manualResolution !== undefined ||
    (isConflictWithMarkers(status) && status.conflictMarkerCount === 0)
  )
}

/** Keep the banner, file rows and continue-button count on the same snapshot. */
export function getConflictProgress(
  workingDirectory: WorkingDirectoryStatus,
  manualResolutions: ReadonlyMap<string, ManualConflictResolution>
) {
  const unmergedFiles = getUnmergedFiles(workingDirectory)
  const conflictedFiles = unmergedFiles.filter(
    file =>
      isConflictedFile(file.status) &&
      !isConflictResolved(file.status, manualResolutions.get(file.path))
  )
  return {
    unmergedFiles,
    conflictedFiles,
    resolvedFilesCount: unmergedFiles.length - conflictedFiles.length,
  }
}
