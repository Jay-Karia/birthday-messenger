import pandas as pd
import glob
import os

#Add the files to ./server/components/xlsDump/ and jst call this function

def csvDump():
    excel_files = glob.glob(os.path.join("./server/components/xlsDump/", "*.xls*"))
    target_keyword = "Student Master"
    skipped_students = []
    seen_students = set()
    all_data = []
    for file in excel_files:
        sheets = pd.read_excel(file, sheet_name=None, header=None)
        matching_sheets = {name: df for name, df in sheets.items() if target_keyword in name}
        
        if matching_sheets:
            for sheet_name, df in matching_sheets.items():
                if df.empty:
                    continue
                df.columns = df.iloc[1]
                df = df.drop([0, 1])
                df = df.dropna(how="all")
                for col in df.columns:
                    col_str = str(col).strip().lower()
                    if col_str in ["s.no", "sl no", "slno", "sno"] or col_str.startswith("unnamed"):
                        df = df.drop(columns=[col])
                        break 
                dob_col = [c for c in df.columns if "DOB" in str(c).upper()]
                if dob_col:
                    col = dob_col[0]
                    df[col] = pd.to_datetime(df[col], errors="coerce", dayfirst=True)
                    df[col] = df[col].dt.strftime("%d-%m-%Y")
                    missing_dob = df[df[col].isna()]
                    if not missing_dob.empty and "Student Name" in df.columns:
                        skipped_students.extend(missing_dob["Student Name"].dropna().tolist())
                    df = df[df[col].notna()]
                phone_cols = [
                    "Parent Whatsapp No.",
                    "Student Whatsapp No."
                ]
                for phone_col in phone_cols:
                    if phone_col in df.columns:
                        df[phone_col] = (
                            df[phone_col]
                            .astype(str)
                            .str.replace(r"\D", "", regex=True)
                            .str.lstrip("0")
                            .apply(lambda x: "91" + x if x else x)
                        )
                if "Student Name" in df.columns:
                    df = df[~df["Student Name"].isin(seen_students)]
                    seen_students.update(df["Student Name"].dropna().tolist())
                
                if not df.empty:
                    all_data.append(df)
        else:
            print(f"{file}: no sheet with '{target_keyword}' found")
    if all_data:
        final_df = pd.concat(all_data, ignore_index=True)
        final_df.to_csv("All_StudentMaster.csv", index=False)
    else:
        print("\nNo valid data to save")
        return "No Valid Data"
    if skipped_students:
        return skipped_students
    else:
        print("\nNo students skipped, all had DOBs!")
        return "All Students Processed"
