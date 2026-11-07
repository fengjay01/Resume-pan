/**
 * 保存到「用户选择的文件夹」（File System Access API）。
 *
 * 背景：批量导出如果走浏览器下载，连续多个文件会被浏览器的多文件下载策略拦截
 * （弹「允许下载多个文件」），且用户无法指定落盘位置。让用户选一次文件夹、
 * 之后逐份 `createWritable()` 直写，两个问题一起解决。
 *
 * 限制：`showDirectoryPicker` 目前只有 Chromium 系（Chrome / Edge）支持，
 * Firefox / Safari 会退化为浏览器默认下载（见 supportsFolderPicker）。
 * 目录句柄只在本次会话有效，刷新后需要重新选择。
 *
 * 类型全部局部声明：不全局 augment Window，避免与 lib.dom 未来加入的同名类型冲突。
 */

export interface FsWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  /** 中止写入（部分实现不支持，按可选处理） */
  abort?: () => Promise<void>;
}

export interface FsFileHandle {
  getFile(): Promise<File>;
  createWritable(): Promise<FsWritable>;
}

export interface FsDirectoryHandle {
  kind: 'directory';
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFileHandle>;
}

type DirectoryPicker = (options?: { mode?: 'read' | 'readwrite' }) => Promise<FsDirectoryHandle>;

function picker(): DirectoryPicker | undefined {
  return (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;
}

/** 当前浏览器是否支持选择保存文件夹（Chromium 系支持） */
export function supportsFolderPicker(): boolean {
  return typeof picker() === 'function';
}

/** 弹出系统文件夹选择框；用户取消返回 null，其余错误抛出 */
export async function pickSaveFolder(): Promise<FsDirectoryHandle | null> {
  const pick = picker();
  if (!pick) return null;
  try {
    // readwrite：选择时一次性拿到写权限，后续逐份写入不再弹授权
    return await pick({ mode: 'readwrite' });
  } catch (err) {
    // 用户点了取消（AbortError）→ 按「不选」处理，不算失败
    if (err instanceof Error && err.name === 'AbortError') return null;
    throw err;
  }
}

/**
 * 把 Blob 写入文件夹，返回最终文件名。
 * 重名时自动加 ` (1)` / ` (2)` 后缀（与浏览器下载行为一致），不覆盖已有文件。
 */
export async function writeFileToFolder(
  dir: FsDirectoryHandle,
  filename: string,
  blob: Blob,
): Promise<string> {
  const exists = async (name: string): Promise<boolean> => {
    try {
      await dir.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  };

  let finalName = filename;
  if (await exists(finalName)) {
    const dot = filename.lastIndexOf('.');
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    const ext = dot > 0 ? filename.slice(dot) : '';
    for (let i = 1; i < 100; i += 1) {
      const candidate = `${base} (${i})${ext}`;
      if (!(await exists(candidate))) {
        finalName = candidate;
        break;
      }
    }
  }

  const handle = await dir.getFileHandle(finalName, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
  } catch (err) {
    // 写一半失败：尽量中止，别留个半截文件占名字
    try {
      await writable.abort?.();
    } catch {
      /* abort 也可能不支持，忽略 */
    }
    throw err;
  }
  await writable.close();
  return finalName;
}
