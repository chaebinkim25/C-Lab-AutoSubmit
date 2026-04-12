import sqlite3
import json
import os

def extract_all_data(db_path):
    # 1. Connect to the database
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # 2. Get a list of all tables in the database
    # 'sqlite_master' is a built-in table that tracks the database schema
    cur.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cur.fetchall()

    database_content = {}

    # 3. Iterate through each table
    for table_name_tuple in tables:
        table_name = table_name_tuple[0] 
        
        # Skip internal SQLite system tables
        if table_name.startswith('sqlite_'):
            continue
            
        print(f"Reading table: {table_name}...")

        # Get column names for context
        cur.execute(f"PRAGMA table_info({table_name});")
        columns = [col_info[1] for col_info in cur.fetchall()]

        # 4. Fetch all rows from the table
        cur.execute(f"SELECT * FROM {table_name};")
        rows = cur.fetchall()

        # 5. Store the data
        database_content[table_name] = {
            "columns": columns,
            "data": rows
        }

    # 6. Close the connection
    conn.close()
    return database_content

# --- Execution ---
db_file = './data/202600000__session0.db'  

# Fallback check to prevent crashing if the file isn't found
if not os.path.exists(db_file):
    print(f"File not found: {db_file}")
else:
    all_data = extract_all_data(db_file)

    # Define the output markdown file name
    output_file = "all_database_logs.md"

    # Open the file in write mode
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("# Full Database Dump\n\n")
        
        # Iterate over every table in the database
        for table_name, table_info in all_data.items():
            f.write(f"# Table: {table_name}\n\n")
            
            columns = table_info['columns']
            data = table_info['data']
            
            if not data:
                f.write("*This table is empty.*\n\n---\n\n")
                continue

            # Iterate over every row in the current table
            for idx, row in enumerate(data, 1):
                # Create a dictionary to easily map column names to their row values
                row_data = dict(zip(columns, row))
                
                # Fetch ID if it exists, otherwise use the loop index
                row_id = row_data.get('id', f'Row {idx}')
                timestamp = row_data.get('timestamp', 'No Timestamp')
                
                f.write(f"## Record ID : {row_id}\n")
                if 'timestamp' in row_data:
                    f.write(f"**Timestamp** : {timestamp}\n\n")
                else:
                    f.write("\n")
                
                # Iterate over the rest of the columns dynamically
                for col_name, item in row_data.items():
                    if col_name in ['id', 'timestamp']:
                        continue
                        
                    f.write(f"### {col_name}\n")
                    item_str = str(item) if item is not None else ""
                    
                    # Formatting: Source code columns
                    if 'source' in col_name or 'code' in col_name:
                        f.write("```c\n")
                        if item_str:
                            lines = item_str.split('\n')
                            for line_num, line in enumerate(lines, 1):
                                f.write(f"{line_num}: {line}\n")
                        f.write("```\n\n")
                        
                    # Formatting: Known JSON columns or strings that look like JSON payloads
                    elif col_name in ['breakpoints', 'execution_actions', 'variable_inspection', 'output_streams'] or (item_str.strip().startswith('{') or item_str.strip().startswith('[')):
                        f.write("```json\n")
                        if item_str:
                            try:
                                parsed_json = json.loads(item_str)
                                f.write(json.dumps(parsed_json, indent=2, ensure_ascii=False) + "\n")
                            except json.JSONDecodeError:
                                # Fallback if it fails to parse as JSON
                                f.write(item_str + "\n")
                        f.write("```\n\n")
                        
                    # Formatting: Standard text/numbers
                    else:
                        f.write(f"{item_str}\n\n")
                        
                f.write("---\n\n") # Add a horizontal line separator between rows

    print(f"Successfully wrote all database tables to {output_file}")
