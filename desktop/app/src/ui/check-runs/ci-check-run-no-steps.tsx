import { materialArtwork } from '../gittogether/material-artwork'
import * as React from 'react'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Button } from '../lib/button'

const PaperStackImage = materialArtwork('FileCode')

interface ICICheckRunNoStepProps {
  /** Callback to opens check runs target url (maybe GitHub, maybe third party) */
  readonly onViewCheckExternally: () => void
}

/** The CI check no step view. */
export class CICheckRunNoStepItem extends React.PureComponent<ICICheckRunNoStepProps> {
  public render() {
    return (
      <div className="ci-check-run-no-steps">
        <p>
          There are no steps to display for this check.
          <Button
            className="button-with-icon"
            onClick={this.props.onViewCheckExternally}
            role="link"
          >
            View check details
            <Octicon symbol={octicons.linkExternal} />
          </Button>
        </p>

        <img src={PaperStackImage} alt="" />
      </div>
    )
  }
}
