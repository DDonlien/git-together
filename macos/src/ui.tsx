import { useCallback, useEffect, useId, useRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { Button as BaseButton, IconButton as BaseIconButton, GlassSystemProvider, SearchField, Dialog, type ButtonProps } from 'open-glass-ui';
import { componentTheme } from './theme';
export { SegmentedControl as Segmented, Select, TextField, Textarea, Switch, Menu, MenuItem, Popover, Toolbar } from 'open-glass-ui';
import { SquaresFourIcon } from '@phosphor-icons/react/dist/csr/SquaresFour';
import { GitBranchIcon } from '@phosphor-icons/react/dist/csr/GitBranch';
import { FolderSimpleIcon } from '@phosphor-icons/react/dist/csr/FolderSimple';
import { CaretRightIcon } from '@phosphor-icons/react/dist/csr/CaretRight';
import { CaretDownIcon } from '@phosphor-icons/react/dist/csr/CaretDown';
import { MagnifyingGlassIcon } from '@phosphor-icons/react/dist/csr/MagnifyingGlass';
import { ArrowDownIcon } from '@phosphor-icons/react/dist/csr/ArrowDown';
import { ArrowUpIcon } from '@phosphor-icons/react/dist/csr/ArrowUp';
import { ArrowsClockwiseIcon } from '@phosphor-icons/react/dist/csr/ArrowsClockwise';
import { CloudArrowDownIcon } from '@phosphor-icons/react/dist/csr/CloudArrowDown';
import { CloudArrowUpIcon } from '@phosphor-icons/react/dist/csr/CloudArrowUp';
import { PlusIcon } from '@phosphor-icons/react/dist/csr/Plus';
import { XIcon } from '@phosphor-icons/react/dist/csr/X';
import { DotsThreeIcon } from '@phosphor-icons/react/dist/csr/DotsThree';
import { SlidersHorizontalIcon } from '@phosphor-icons/react/dist/csr/SlidersHorizontal';
import { SidebarSimpleIcon } from '@phosphor-icons/react/dist/csr/SidebarSimple';
import { GearSixIcon } from '@phosphor-icons/react/dist/csr/GearSix';
import { SparkleIcon } from '@phosphor-icons/react/dist/csr/Sparkle';
import { CheckCircleIcon } from '@phosphor-icons/react/dist/csr/CheckCircle';
import { CheckIcon } from '@phosphor-icons/react/dist/csr/Check';
import { WarningCircleIcon } from '@phosphor-icons/react/dist/csr/WarningCircle';
import { SpinnerGapIcon } from '@phosphor-icons/react/dist/csr/SpinnerGap';
import { RobotIcon } from '@phosphor-icons/react/dist/csr/Robot';
import { UsersIcon } from '@phosphor-icons/react/dist/csr/Users';
import { FileCodeIcon } from '@phosphor-icons/react/dist/csr/FileCode';
import { FileIcon } from '@phosphor-icons/react/dist/csr/File';
import { ImageIcon } from '@phosphor-icons/react/dist/csr/Image';
import { CubeIcon } from '@phosphor-icons/react/dist/csr/Cube';
import { ClockIcon } from '@phosphor-icons/react/dist/csr/Clock';
import { CopyIcon } from '@phosphor-icons/react/dist/csr/Copy';
import { BookOpenIcon } from '@phosphor-icons/react/dist/csr/BookOpen';
import { ArrowSquareOutIcon } from '@phosphor-icons/react/dist/csr/ArrowSquareOut';
import { CommandIcon } from '@phosphor-icons/react/dist/csr/Command';
import { DesktopIcon } from '@phosphor-icons/react/dist/csr/Desktop';
import { MoonIcon } from '@phosphor-icons/react/dist/csr/Moon';
import { SunIcon } from '@phosphor-icons/react/dist/csr/Sun';
import { GitCommitIcon } from '@phosphor-icons/react/dist/csr/GitCommit';
import { ListBulletsIcon } from '@phosphor-icons/react/dist/csr/ListBullets';
import { GitDiffIcon } from '@phosphor-icons/react/dist/csr/GitDiff';
import { BroomIcon } from '@phosphor-icons/react/dist/csr/Broom';
import { EyeIcon } from '@phosphor-icons/react/dist/csr/Eye';
import { EyeSlashIcon } from '@phosphor-icons/react/dist/csr/EyeSlash';

const icons = { dashboard: SquaresFourIcon, branch: GitBranchIcon, folder: FolderSimpleIcon, right: CaretRightIcon, down: CaretDownIcon, search: MagnifyingGlassIcon, arrowDown: ArrowDownIcon, arrowUp: ArrowUpIcon, refresh: ArrowsClockwiseIcon, download: CloudArrowDownIcon, upload: CloudArrowUpIcon, plus: PlusIcon, close: XIcon, more: DotsThreeIcon, sliders: SlidersHorizontalIcon, sidebar: SidebarSimpleIcon, settings: GearSixIcon, sparkle: SparkleIcon, success: CheckCircleIcon, check: CheckIcon, warning: WarningCircleIcon, spinner: SpinnerGapIcon, robot: RobotIcon, users: UsersIcon, code: FileCodeIcon, file: FileIcon, image: ImageIcon, cube: CubeIcon, clock: ClockIcon, copy: CopyIcon, book: BookOpenIcon, external: ArrowSquareOutIcon, command: CommandIcon, desktop: DesktopIcon, moon: MoonIcon, sun: SunIcon, commit: GitCommitIcon, list: ListBulletsIcon, reconcile: GitDiffIcon, clear: BroomIcon, eye: EyeIcon, eyeSlash: EyeSlashIcon };
export type IconName = keyof typeof icons;
export function Icon({ name, size = 18, className = '', style }: { name: IconName | 'squares'; size?: number; className?: string; style?: CSSProperties }) { const Component = name === 'squares' ? SquaresFourIcon : icons[name]; return <Component size={size} weight="regular" className={className} style={style} aria-hidden="true" />; }
// Reuse accessible interaction/portal contracts, not optical glass recipes.
// One non-optical boundary gives app content and portals the same M3 tokens.
export function MaterialProvider({ appearance, children }: { appearance: 'light' | 'dark' | 'system'; children: ReactNode }) {
  return <GlassSystemProvider renderer="css" design="classic" motion="system" toasts={false} theme={{ appearance, defaultAppearance: 'light', style: componentTheme, className: 'app-theme' }}>{children}</GlassSystemProvider>;
}
export function Button({ className = '', size = 'small', variant = 'secondary', ...props }: ButtonProps) { return <BaseButton {...props} className={`app-button ${className}`} size={size} variant={variant} />; }
export function IconButton({ icon, label, title = label, children, className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) { return <BaseIconButton {...props} size="small" variant="quiet" title={title} aria-label={label} className={`icon-button ${className}`}><Icon name={icon} size={17} />{children}</BaseIconButton>; }
export function Checkbox({ checked, mixed = false, label, onChange, disabled }: { checked: boolean; mixed?: boolean; label: string; onChange: () => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  // Indeterminate is a native input property, not a separate selection state.
  useEffect(() => { ref.current!.indeterminate = mixed; }, [mixed]);
  return <label className="selection-checkbox"><input ref={ref} type="checkbox" checked={checked} aria-label={label} onChange={onChange} disabled={disabled} /></label>;
}
export function SearchInput({ value, onChange, placeholder, inputRef }: { value: string; onChange: (value: string) => void; placeholder: string; inputRef?: RefObject<HTMLInputElement | null> }) {
  const id = useId();
  useEffect(() => { if (inputRef) { inputRef.current = document.getElementById(id) as HTMLInputElement; return () => { inputRef.current = null; }; } }, [id, inputRef]);
  return <SearchField id={id} label={placeholder} aria-label={placeholder} value={value} onValueChange={onChange} placeholder={placeholder} className="search-field" />;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const opener = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  // A stable callback keeps the library's focus trap from restarting on every
  // field edit. Controlled dialogs mount open, so restore focus on unmount.
  const changeOpen = useCallback((open: boolean) => { if (!open) closeRef.current(); }, []);
  useEffect(() => () => { requestAnimationFrame(() => { if (opener.current?.isConnected) opener.current.focus(); }); }, []);
  return <Dialog title={title} open onOpenChange={changeOpen}>{children}</Dialog>;
}
export function Notice({ kind, children }: { kind: 'success' | 'error' | 'info'; children: ReactNode }) { return <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}><Icon name={kind === 'success' ? 'success' : kind === 'error' ? 'warning' : 'sparkle'} size={17} /><span>{children}</span></div>; }
