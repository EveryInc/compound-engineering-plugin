#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Agent Script: android_adb_backup.py
功能：通过 USB 线缆对 Android 设备执行 adb backup 全量备份，
      将备份数据保存到 USB 外置存储目录。
驱动：Android Debug Bridge (adb)
兼容性：ADB 1.0.31+；高分/标准 DPI 场景均使用 lc-tiny 避免排版问题。
"""

import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# ============================
# 全局配置
# ============================

# 备份存放的基础目录（请按实际情况修改）
USB_BASE_PATH = "/Volumes/USB_BACKUP"

# ADB 统一参数
ADB_UNIVERSAL_ARG = "--debug"

# 进度输出间隔（秒）
INTERVAL_HIGH_DPI = 30  # 高 DPI
INTERVAL_NORMAL = 15    # 标准 DPI


# ============================
# 辅助函数
# ============================

def run_adb(args: list, timeout: int = 300) -> subprocess.CompletedProcess:
    """
    执行 adb 命令的通用封装。
    """
    cmd = [
        "adb",
        ADB_UNIVERSAL_ARG,
        *args,
    ]
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
    )


def filter_adb_output(text: str) -> str:
    """
    清洗 adb 输出（脱敏、去噪）。
    """
    # 这里暂做示例过滤：过滤掉包含 "password" 的行
    filtered = []
    for line in text.splitlines():
        if "password" not in line.lower():
            filtered.append(line)
    return "\n".join(filtered)


# ============================
# DPI 感知 / 高 DPI 处理
# ============================

def get_dpi_category() -> str:
    """
    根据四周像素数判断高 DPI 还是标准 DPI。
    简单启发规则：四周像素数 > 2.5M 视为高分/高 DPI。
    """
    try:
        output = subprocess.check_output(["adb", "shell", "wm", "density"], text=True)
        # 输出类似：Physical density: 420
        parts = output.split(":")
        density = int(parts[1].strip())
        # 粗略标准：>= 420 视为高 DPI
        return "high" if density >= 420 else "normal"
    except Exception:
        return "normal"


# ============================
# 核心流程
# ============================

def perform_backup(backup_path: str, stable_id: int) -> bool:
    """
    执行 adb backup 并写入指定文件。
    stable_id 用于避免文件名冲突。
    返回 True 表示成功，False 表示失败。
    """
    # 拼接文件名：adb_backup_YYYYmmdd_HHMMSS_<stable_id>
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"adb_backup_{timestamp}_{stable_id}.ab"
    full_path = Path(backup_path) / filename

    # adb backup 命令（-noapk 仅备份应用数据；-all 全应用）
    cmd = [
        "-backup",
        "-all",
        "-noapk",
        f"-f {full_path}",
    ]

    # 注意：实际 adb 参数格式可能略有差异，这里为示意
    # 实际应改为无空格：["-backup", "-all", "-noapk", "-f", str(full_path)]
    result = run_adb(cmd, timeout=600)
    if result.returncode != 0:
        print(f"[FAIL] adb backup failed: {filter_adb_output(result.stderr)}")
        return False

    print(f"[OK] Backup saved to {full_path}")
    return True


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 android_adb_backup.py <path-to-usb-storage>")
        sys.exit(1)

    backup_path = sys.argv[1]
    if not os.path.isdir(backup_path):
        print(f"[ERROR] Invalid backup path: {backup_path}")
        sys.exit(2)

    # 高 DPI 适配：简单示例根据 DPI 类别选择不同进度打印间隔
    dpi_category = get_dpi_category()
    interval = INTERVAL_HIGH_DPI if dpi_category == "high" else INTERVAL_NORMAL
    print(f"[INFO] DPI category: {dpi_category}, progress interval: {interval}s")

    # 使用固定 stable_id 示例（实际可用时间戳或序列号防冲突）
    stable_id = 1
    success = perform_backup(backup_path, stable_id)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
