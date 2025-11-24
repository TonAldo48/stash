import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, Upload, X } from "lucide-react";

export default function FileUpload05() {
  return (
    <div className="sm:mx-auto sm:max-w-lg flex items-center justify-center p-6 w-full max-w-lg">
      <form className="w-full">
        <h3 className="text-lg font-semibold text-foreground">File Upload</h3>
        <div className="mt-4 flex justify-center space-x-4 rounded-md border border-dashed border-input px-6 py-10">
          <div className="sm:flex sm:items-center sm:gap-x-3">
            <Upload
              className="mx-auto h-8 w-8 text-muted-foreground sm:mx-0 sm:h-6 sm:w-6"
              aria-hidden={true}
            />
            <div className="mt-4 flex text-sm leading-6 text-foreground sm:mt-0">

              <Label
                htmlFor="file-upload-4"
                className="relative cursor-pointer rounded-sm pl-1 font-medium text-primary hover:underline hover:underline-offset-4"
              >
                <span> Drag and drop or choose file to upload </span>
                <input
                  id="file-upload-4"
                  name="file-upload-4"
                  type="file"
                  className="sr-only"
                />
              </Label>
            </div>
          </div>
        </div>
        <p className="mt-2 flex items-center justify-between text-xs leading-5 text-muted-foreground">
          Max file size: 10MB
        </p>
        {/* File list would go here */}
        <div className="mt-8 flex items-center justify-end space-x-3">
          <Button
            type="button"
            variant="outline"
            className="whitespace-nowrap rounded-sm border border-input px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-accent hover:text-foreground"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="default"
            className="whitespace-nowrap rounded-sm bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Upload
          </Button>
        </div>
      </form>
    </div>
  );
}
