import * as React from 'react'
import * as URL from 'url'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IUntrustedCertificateProps {
  /** The untrusted certificate. */
  readonly certificate: Electron.Certificate

  /** The URL which was being accessed. */
  readonly url: string

  /** The function to call when the user chooses to dismiss the dialog. */
  readonly onDismissed: () => void

  /**
   * The function to call when the user chooses to continue in the process of
   * trusting the certificate.
   */
  readonly onContinue: (certificate: Electron.Certificate) => void
}

/**
 * The dialog we display when an API request encounters an untrusted
 * certificate.
 *
 * An easy way to test this dialog is to attempt to sign in to GitHub
 * Enterprise using  one of the badssl.com domains, such
 * as https://self-signed.badssl.com/
 */
export class UntrustedCertificate extends React.Component<
  IUntrustedCertificateProps,
  {}
> {
  public render() {
    const host = URL.parse(this.props.url).hostname

    return (
      <Dialog
        title="检查服务器证书"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onContinue}
        type={__DARWIN__ ? 'warning' : 'error'}
      >
        <DialogContent>
          <p>
            无法确认 {host} 的服务器身份。证书（{this.props.certificate.subjectName}）无效或不受信任。
            <strong>请先核实服务器身份，再决定是否信任此证书。</strong>
          </p>
          <p>你可以查看证书的域名、签发者和有效期。</p>
          <p>
            如果服务器由你维护，请检查 HTTPS 证书及完整证书链；否则请联系服务器管理员。
          </p>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={__DARWIN__ ? '查看证书' : '添加证书'}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onContinue = () => {
    this.props.onDismissed()
    this.props.onContinue(this.props.certificate)
  }
}
