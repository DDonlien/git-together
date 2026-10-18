import { materialArtwork } from '../gittogether/material-artwork'
import * as React from 'react'

const BlankSlateImage = materialArtwork('FileCode')

interface IMultipleSelectionProps {
  /** Called when the user chooses to open the repository. */
  readonly count: number
}
/** The component to display when there are no local changes. */
export class MultipleSelection extends React.Component<
  IMultipleSelectionProps,
  {}
> {
  public render() {
    return (
      <div className="panel blankslate" id="no-changes">
        <img src={BlankSlateImage} className="blankslate-image" alt="" />
        <div>{this.props.count} files selected</div>
      </div>
    )
  }
}
