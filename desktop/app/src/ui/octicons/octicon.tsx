import * as React from 'react'
import { OcticonSymbol } from '.'
import ReactDOM from 'react-dom'
import { TooltipDirection } from '../lib/tooltip'
import { MaterialIcon, iconForSymbol } from '../gittogether/material-icon'

interface IOcticonProps {
  /**
   * An instance of an object conforming to the OcticonSymbol type. Supports
   * custom paths as well as those provided through the static properties of
   * the OcticonSymbol class.
   */
  readonly symbol: OcticonSymbol

  /**
   * An optional classname that will be appended to the default
   * class name 'octicon'
   */
  readonly className?: string

  /**
   * An optional string to use as a tooltip and aria-label for the icon
   */
  readonly title?: string

  readonly tooltipDirection?: TooltipDirection

  readonly height?: number
}

/**
 * A React component for displaying octicon symbols in SVG format.
 *
 * Note that the aspect ratios of the octicons will always be preserved
 * which is why the width and height properties specify the maximum and
 * not the minimum size.
 *
 * Usage: `<Octicon symbol={octicons.markGithub} />`
 */
export class Octicon extends React.Component<IOcticonProps, {}> {
  public render() {
    return <MaterialIcon name={iconForSymbol(this.props.symbol)} title={this.props.title}
      size={this.props.height ?? 18} className={this.props.className} />
  }
}

/**
 * Create an Octicon element for the DOM, wrapped in a div element.
 *
 * @param symbol    OcticonSymbol to render in the element.
 * @param className Optional class to add to the wrapper element.
 * @param id        Optional identifier to set to the wrapper element.
 */
export function createOcticonElement(
  symbol: OcticonSymbol,
  className?: string,
  id?: string
) {
  const wrapper = document.createElement('div')
  wrapper.id = id ?? ''
  if (className !== undefined) {
    wrapper.classList.add(className)
  }
  const octicon = <Octicon symbol={symbol} />
  ReactDOM.render(octicon, wrapper)
  return wrapper
}
