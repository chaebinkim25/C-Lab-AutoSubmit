# server/setup_env.py

import os
import secrets
from pathlib import Path

def setup_environment():
    script_dir = Path(__file__).resolve().parent

    env_file = script_dir / '.env'
    
    # Safety check: Don't overwrite an existing .env file
    if env_file.exists():
        print("A .env file already exists. Aborting to prevent overwriting your keys.")
        return

    print("Generating secure keys...")
    
    # Generate a cryptographically secure 32-byte (64 character) hex string
    jwt_secret = secrets.token_hex(32)
    
    # Define the content of your .env file
    env_content = f"""

# Auto-generated .env file

# Do not commit this file to version control!

JWT_SECRET={jwt_secret}

# AWS EBS Backup Configuration

"""
    
    # Write the content to the .env file
    with open(env_file, 'w', encoding='utf-8') as f:
        f.write(env_content)
        
    print("Successfully created .env file with a secure JWT_SECRET.")

if __name__ == "__main__":
    setup_environment()
