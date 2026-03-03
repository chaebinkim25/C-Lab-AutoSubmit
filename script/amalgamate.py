import os
from pathlib import Path

# Directories to scan (relative to where this script lives)
SOURCE_DIRS = [Path('../docs'), Path('../server')]

# Specific external files to include
EXTRA_FILES = [Path('../c-lab-autosubmit/src/extension.ts'), 
               Path('../c-lab-autosubmit/package.json'), 
               Path('../c-lab-autosubmit/README.md'),
               Path('../server/.env')]

# Output location
OUTPUT_FILE = Path('../amalgamated.txt')

EXTENSIONS = {'.py', '.json', '.tsx', '.js', '.ts', '.md'}

def amalgamate() -> None:
    files_to_merge: list[Path] = []

    # 1. Gather explicitly requested extra files
    for extra_file in EXTRA_FILES:
        if extra_file.is_file():
            files_to_merge.append(extra_file)
        else:
            print(f"Warning: Extra file '{extra_file}' not found. Skipping.")

    # 2. Gather files from source directories
    for src_dir in SOURCE_DIRS:
        if not src_dir.is_dir():
            print(f"Warning: Source directory '{src_dir}' does not exist. Skipping.")
            continue

        # os.walk allows us to efficiently skip hidden directories
        for root, dirs, files in os.walk(src_dir):
            # Modify the 'dirs' list in-place to skip any folder starting with '.'
            dirs[:] = [d for d in dirs if (not d.startswith('.') and not d.startswith('_'))]
            
            for file in files:
                # Skip hidden files
                if file.startswith('.'):
                    continue
                
                print(f"current file: {file}")

                file_path = Path(root) / file
                if file_path.suffix in EXTENSIONS:
                    files_to_merge.append(file_path)

    # Sort to ensure the output file is always generated in the exact same order
    files_to_merge.sort()

    if not files_to_merge:
        print("No matching files found to amalgamate.")
        return

    # Create output file parent directory if it doesn't exist
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    with OUTPUT_FILE.open('w', encoding='utf-8') as outfile:
        for file_path in files_to_merge:
            # Prevent the script from reading its own output if saved in the same dir
            if file_path.resolve() == OUTPUT_FILE.resolve():
                continue 

            # as_posix() ensures standard forward slashes (e.g., ../to_do.md)
            rel_path = file_path.as_posix()
            
            # Write the file annotation banner strictly using '#'
            outfile.write(f"# =========================================\n")
            outfile.write(f"# File: {rel_path}\n")
            outfile.write(f"# =========================================\n\n")
            
            # Write the file content
            try:
                content = file_path.read_text(encoding='utf-8')
                outfile.write(content)
                outfile.write("\n\n")
            except Exception as e:
                print(f"Skipping {rel_path} due to read error: {e}")

    print(f"Successfully amalgamated {len(files_to_merge)} files into '{OUTPUT_FILE.as_posix()}'")

if __name__ == "__main__":
    # Lock the working directory to the folder containing this script
    script_dir = Path(__file__).parent.resolve()
    os.chdir(script_dir)
    print(f"Working directory set to: {script_dir}")
    
    amalgamate()
