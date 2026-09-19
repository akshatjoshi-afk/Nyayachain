from fastapi import FastAPI, UploadFile, File, HTTPException
from paddleocr import PaddleOCR
import tempfile
import os
import json

app = FastAPI()

print("Loading PaddleOCR...")

# PaddleOCR configuration
ocr = PaddleOCR(
    lang="en",
    device="cpu",
    enable_mkldnn=False,

    # Disable extra document-processing stages
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,
)

print("PaddleOCR loaded successfully!")


@app.get("/")
def home():
    return {
        "status": "OCR service is running"
    }


@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)):
    tmp_path = None

    try:
        # -----------------------------------------
        # 1. Receive uploaded file
        # -----------------------------------------
        print("Received file:", file.filename)

        suffix = os.path.splitext(file.filename or "")[1] or ".jpg"

        # -----------------------------------------
        # 2. Save uploaded file temporarily
        # -----------------------------------------
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix
        ) as tmp:

            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        print("File saved to:", tmp_path)
        print("Starting OCR...")

        # -----------------------------------------
        # 3. Run PaddleOCR
        # -----------------------------------------
        results = ocr.predict(tmp_path)

        print("OCR prediction completed")
        print("Result type:", type(results))

        # -----------------------------------------
        # 4. Extract recognized text
        # -----------------------------------------
        extracted_lines = []

        for result in results:

            print("Result object type:", type(result))

            # -------------------------------------
            # Method 1: Dictionary-style access
            # -------------------------------------
            try:
                texts = result["rec_texts"]

                if texts:
                    print("Found texts:", len(texts))
                    extracted_lines.extend(texts)
                    continue

            except Exception:
                pass

            # -------------------------------------
            # Method 2: JSON property
            # -------------------------------------
            try:
                data = result.json

                if callable(data):
                    data = data()

                if isinstance(data, str):
                    data = json.loads(data)

                if isinstance(data, dict):

                    texts = data.get("rec_texts", [])

                    if texts:
                        print(
                            "Found texts from JSON:",
                            len(texts)
                        )

                        extracted_lines.extend(texts)
                        continue

            except Exception as e:
                print(
                    "JSON extraction failed:",
                    repr(e)
                )

            # -------------------------------------
            # Method 3: Direct attribute access
            # -------------------------------------
            try:
                texts = result.rec_texts

                if texts:
                    print(
                        "Found texts from attribute:",
                        len(texts)
                    )

                    extracted_lines.extend(texts)
                    continue

            except Exception as e:
                print(
                    "Attribute extraction failed:",
                    repr(e)
                )

        # -----------------------------------------
        # 5. Clean and combine OCR text
        # -----------------------------------------
        full_text = "\n".join(
            str(text).strip()
            for text in extracted_lines
            if text and str(text).strip()
        )

        # -----------------------------------------
        # 6. Print result to terminal
        # -----------------------------------------
        print("----------------------------------------")
        print("OCR FINISHED!")
        print("Extracted lines:", len(extracted_lines))
        print("Extracted characters:", len(full_text))
        print("----------------------------------------")
        print("EXTRACTED TEXT:")
        print(full_text)
        print("----------------------------------------")

        # -----------------------------------------
        # 7. Return JSON response
        # -----------------------------------------
        return {
            "filename": file.filename,
            "text": full_text
        }

    except Exception as e:

        print("----------------------------------------")
        print("OCR ERROR:")
        print(repr(e))
        print("----------------------------------------")

        raise HTTPException(
            status_code=500,
            detail=str(e)
        )

    finally:

        # -----------------------------------------
        # 8. Delete temporary file
        # -----------------------------------------
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

        print("Temporary file cleaned up.")