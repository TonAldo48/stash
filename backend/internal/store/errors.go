package store

import "errors"

var (
	// ErrUploadNotFound indicates the upload record could not be found.
	ErrUploadNotFound = errors.New("upload not found")

	// ErrChunkOutOfOrder indicates the chunk index did not match server expectations.
	ErrChunkOutOfOrder = errors.New("chunk index out of order")
)
