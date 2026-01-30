"""
Runtime detection and management for Node.js/Bun execution.

This module handles:
- Detecting available JavaScript runtimes (bun, node, npx, bunx)
- Auto-installing Bun if needed
- Executing commands with the best available runtime
"""

import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional, Tuple, List


class RuntimeError(Exception):
    """Raised when no suitable JavaScript runtime is found."""

    pass


def find_runtime() -> Tuple[str, List[str]]:
    """
    Find the best available JavaScript runtime.

    Returns:
        Tuple of (runtime_name, command_prefix)
        e.g., ("bun", ["bunx", "@emasoft/svg-matrix"])

    Raises:
        RuntimeError: If no runtime is available
    """
    # Prefer bunx (faster, better caching)
    if shutil.which("bunx"):
        return ("bun", ["bunx", "@emasoft/svg-matrix"])

    # Fall back to npx
    if shutil.which("npx"):
        return ("node", ["npx", "@emasoft/svg-matrix"])

    # Check if bun exists but bunx doesn't (shouldn't happen)
    if shutil.which("bun"):
        return ("bun", ["bun", "x", "@emasoft/svg-matrix"])

    raise RuntimeError(
        "No JavaScript runtime found. Install Bun (recommended) or Node.js:\n"
        "  Bun:  curl -fsSL https://bun.sh/install | bash\n"
        "  Node: https://nodejs.org/"
    )


def install_bun() -> bool:
    """
    Attempt to install Bun automatically.

    Returns:
        True if installation succeeded, False otherwise
    """
    if shutil.which("bun"):
        return True

    print("Bun not found. Attempting to install...", file=sys.stderr)

    try:
        # Install Bun (works on macOS, Linux, WSL)
        result = subprocess.run(
            "curl -fsSL https://bun.sh/install | bash",
            shell=True,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode == 0:
            print("Bun installed successfully.", file=sys.stderr)
            # Note: User may need to restart shell for PATH updates
            return True
        else:
            print(f"Bun installation failed: {result.stderr}", file=sys.stderr)
            return False

    except subprocess.TimeoutExpired:
        print("Bun installation timed out.", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Bun installation error: {e}", file=sys.stderr)
        return False


def ensure_runtime() -> Tuple[str, List[str]]:
    """
    Ensure a JavaScript runtime is available, installing Bun if needed.

    Returns:
        Tuple of (runtime_name, command_prefix)

    Raises:
        RuntimeError: If no runtime could be found or installed
    """
    try:
        return find_runtime()
    except RuntimeError:
        # Try to install Bun
        if install_bun():
            return find_runtime()
        raise


def run_command(
    args: List[str],
    *,
    capture_output: bool = True,
    timeout: Optional[int] = 60,
    cwd: Optional[Path] = None,
) -> subprocess.CompletedProcess:
    """
    Run a command using the best available JavaScript runtime.

    Args:
        args: Command arguments (e.g., ["svgm", "input.svg", "-o", "output.svg"])
        capture_output: Whether to capture stdout/stderr
        timeout: Timeout in seconds (None for no timeout)
        cwd: Working directory for the command

    Returns:
        CompletedProcess instance

    Raises:
        RuntimeError: If no runtime is available
        subprocess.TimeoutExpired: If the command times out
    """
    _, cmd_prefix = ensure_runtime()

    full_command = cmd_prefix + args

    return subprocess.run(
        full_command,
        capture_output=capture_output,
        text=True,
        timeout=timeout,
        cwd=cwd,
    )


def get_version() -> Optional[str]:
    """
    Get the installed svg-matrix npm package version.

    Returns:
        Version string or None if not installed
    """
    try:
        result = run_command(["svgm", "--version"], timeout=30)
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return None
