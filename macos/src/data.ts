import { defaultPreferences, type ChangeFile, type Commit, type Repository, type Worktree, type Workspace } from './domain';

const file = (id: string, name: string, path: string, kind: ChangeFile['kind'], selected = false, tracked = true): ChangeFile => ({ id, name, path, kind, selected, tracked, added: id === 'input' ? 12 : 48, removed: id === 'input' ? 4 : 12, size: kind === 'binary' ? '1.4 MB' : kind === 'image' ? '284 KB' : '3.2 KB', change: tracked ? 'modified' : 'added' });
export const controllerFiles: ChangeFile[] = [
  file('controller', 'ControllerInput.cpp', 'Source/BallMaze/', 'text', true),
  file('input', 'InputMapping.ini', 'Config/', 'text', true),
  file('player', 'BP_Player.uasset', 'Content/Blueprints/', 'binary'),
  file('menu', 'WBP_MainMenu.uasset', 'Content/UI/', 'binary', true),
  file('physics', 'BallPhysics.cpp', 'Source/BallMaze/', 'text'),
  file('hints', 'GamepadHints.png', 'Content/UI/', 'image'),
  file('gamepad', 'GamepadIcon.png', 'Content/UI/', 'image', false, false),
  file('notes', 'ControllerNotes.md', 'Docs/', 'text', false, false),
];

export const history: Commit[] = [
  { id: 'e482a10', summary: 'Update controller mapping', description: 'Refine analog input mapping and update controller presets.', author: '你', time: '20 分钟前', branch: 'pc/zhengtao/controller', parents: ['913fc8a'], files: controllerFiles.slice(0, 2) },
  { id: '913fc8a', summary: 'Main-menu navigation', description: 'Enable gamepad focus across main-menu buttons.', author: '你', time: '1 小时前', branch: 'pc/zhengtao/controller', parents: ['421b13d'], files: controllerFiles.slice(3, 4) },
  { id: '8d729c1', summary: 'Update input presets', description: 'Tune movement input defaults for keyboard and controller.', author: '小林', time: '2 小时前', branch: 'pc/main', parents: ['f9c084b'], files: controllerFiles.slice(1, 2) },
  { id: '421b13d', summary: 'Controller dead zone', description: 'Add a configurable dead zone to controller input.', author: '你', time: '3 小时前', branch: 'pc/zhengtao/controller', parents: ['f9c084b'], files: controllerFiles.slice(0, 1) },
  { id: 'f9c084b', summary: 'Shared controller base', description: 'Share the common input abstraction across branches.', author: '你', time: '昨天', branch: 'pc/main', parents: ['5d123be'], files: controllerFiles.slice(0, 2) },
  { id: '5d123be', summary: 'Save checkpoints', description: 'Save progress when players reach a checkpoint.', author: 'Decay', time: '2 天前', branch: 'pc/main', parents: ['3b90a44'], files: [] },
  { id: '3b90a44', summary: 'Initial project', description: 'Initialize the project.', author: '你', time: '3 天前', branch: 'pc/main', parents: [], files: [] },
];

function makeWorktree(id: string, label: string, branch: string, count: number, changes: Partial<Worktree> = {}): Worktree {
  const files = count === 0 ? [] : controllerFiles.slice(0, Math.min(count, 8)).map(f => ({ ...f }));
  for (let i = files.length; i < count; i++) files.push(file(`extra-${i}`, `Gameplay${i}.ts`, 'Source/Gameplay/', 'text'));
  return { id, label, branch, path: `~/Projects/${id}`, ahead: 0, behind: 0, agents: 0, owner: 'Zhengtao', conflict: false, presence: false, activity: 25, files,
    commits: history.map(c => ({ ...c, parents: [...c.parents], files: [...c.files] })), draft: { summary: '', description: '' }, fetched: '10 分钟前', ...changes };
}

export function createWorkspace(): Workspace {
  const repositories: Repository[] = [
    { id: 'ball-maze', name: 'Ball Maze', description: 'Unreal Engine · 游戏项目', color: '#5889ef', source: 'local', branches: ['pc/main', 'pc/zhengtao/controller', 'mobile/main', 'console/main'], worktrees: [
      makeWorktree('ball-main', 'PC / Main', 'pc/main', 12, { ahead: 2, activity: 2, agents: 1 }),
      makeWorktree('ball-controller', 'PC / Controller', 'pc/zhengtao/controller', 8, { ahead: 2, activity: 12, agents: 1, presence: true }),
      makeWorktree('ball-mobile', 'Mobile', 'mobile/main', 6, { ahead: 1, activity: 35 }),
    ] },
    { id: 'must-be-human', name: 'Must Be Human', description: 'Godot · 双人物理游戏', color: '#9783df', source: 'local', branches: ['main', 'physics/main'], worktrees: [
      makeWorktree('human-main', 'Main', 'main', 8, { behind: 3, agents: 1, activity: 8, conflict: true }),
      makeWorktree('human-physics', 'Physics', 'physics/main', 0, { behind: 1, activity: 17 }),
    ] },
    { id: 'zibuyu', name: 'Zibuyu', description: 'Godot · 原型', color: '#6dab9c', source: 'local', branches: ['main'], worktrees: [makeWorktree('zibuyu-main', 'Main', 'main', 0)] },
    { id: 'lebab', name: 'Lebab', description: '游戏 idea · 原型', color: '#d29b57', source: 'local', branches: ['main'], worktrees: [makeWorktree('lebab-main', 'Main', 'main', 4, { ahead: 1, activity: 41 })] },
    { id: 'git-together', name: 'Git Together', description: 'Git 客户端', color: '#688ce0', source: 'local', branches: ['main'], worktrees: [makeWorktree('together-main', 'Main', 'main', 6, { behind: 1, activity: 60 })] },
    { id: 'myissue', name: 'myIssue', description: '任务与项目记录', color: '#d2798e', source: 'local', branches: ['main'], worktrees: [makeWorktree('issue-main', 'Main', 'main', 2, { ahead: 1, activity: 120 })] },
    { id: 'mymark', name: 'myMark', description: '内容收集工具', color: '#7c9ab3', source: 'local', branches: ['main'], worktrees: [makeWorktree('mark-main', 'Main', 'main', 0, { activity: 180 })] },
    { id: 'ball-maze-tools', name: 'Ball Maze Tools', description: '开发辅助工具', color: '#ba9175', source: 'local', branches: ['main'], worktrees: [makeWorktree('tools-main', 'Main', 'main', 3, { behind: 2, activity: 1440 })] },
  ];
  return { version: 1, repositories, preferences: { ...defaultPreferences } };
}

export const scenes = [
  ['00', '阅读说明与导航', 'guide'], ['01', 'Dashboard · 折叠', 'dashboard'],
  ['02', 'Dashboard · 展开', 'dashboard'], ['03', 'Dashboard · 多选批量', 'dashboard'],
  ['04', 'Dashboard · 部分失败', 'dashboard'], ['05', 'Dashboard · 行内操作', 'dashboard'],
  ['06', 'Repo · Files 与 Git Graph', 'repo'], ['07', 'Repo · Files 与文件夹', 'repo'],
  ['08', 'Repo · 文件 Diff', 'repo'], ['09', 'Repo · AI 生成中', 'repo'],
  ['10', 'Repo · Commit 成功', 'repo'], ['11', 'Repo · Commit 失败', 'repo'],
  ['12', 'Repo · 收起详情栏', 'repo'],
] as const;

export type DiffLine = { type: 'context' | 'add' | 'remove' | 'header'; text: string; old?: number; next?: number };
export function demoDiff(file: ChangeFile): DiffLine[] {
  if (file.kind !== 'text') return [];
  if (file.id === 'input') return [
    { type: 'header', text: '@@ -12,5 +12,6 @@ Input mapping' },
    { type: 'context', text: '[/Script/Engine.InputSettings]', old: 12, next: 12 },
    { type: 'remove', text: 'DeadZone=0.20', old: 13 },
    { type: 'add', text: 'DeadZone=0.12', next: 13 },
    { type: 'add', text: 'ControllerNavigation=True', next: 14 },
    { type: 'context', text: 'Sensitivity=1.0', old: 14, next: 15 },
  ];
  if (!file.tracked) return [
    { type: 'header', text: '@@ -0,0 +1,5 @@ New file' },
    ...['# Controller input notes', '', 'Support analog sticks and keyboard input.', 'Use a configurable dead zone.', 'Verify menu focus with a gamepad.'].map((text, i) => ({ type: 'add' as const, text, next: i + 1 })),
  ];
  return [
    { type: 'header', text: '@@ -20,11 +20,16 @@ Handle input' },
    { type: 'context', text: 'void HandleInput(float DeltaTime)', old: 20, next: 20 },
    { type: 'context', text: '{', old: 21, next: 21 },
    { type: 'remove', text: '    ApplyInput(InputAxis);', old: 22 },
    { type: 'remove', text: '    UpdateHints();', old: 23 },
    { type: 'add', text: '    const auto Axis = ApplyDeadZone(InputAxis);', next: 22 },
    { type: 'add', text: '    UpdateInputMapping(Axis);', next: 23 },
    { type: 'context', text: '', old: 24, next: 24 },
    { type: 'context', text: '    // Keep navigation in sync with input.', old: 25, next: 25 },
    { type: 'add', text: '    if (IsUsingController())', next: 26 },
    { type: 'add', text: '        UpdateMenuFocus(DeltaTime);', next: 27 },
    { type: 'context', text: '}', old: 26, next: 28 },
  ];
}
