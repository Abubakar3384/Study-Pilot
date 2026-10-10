"""Application errors. Each maps to an HTTP status and a stable machine-readable code.

All error responses share one shape: {"error": {"code": "...", "message": "..."}}.
"""


class AppError(Exception):
    status_code = 500
    code = "internal_error"

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFoundError(AppError):
    status_code = 404
    code = "not_found"


class InvalidPDFError(AppError):
    status_code = 422
    code = "invalid_pdf"


class FileTooLargeError(AppError):
    status_code = 413
    code = "file_too_large"


class DocumentNotReadyError(AppError):
    status_code = 409
    code = "document_not_ready"


class RequestValidationAppError(AppError):
    status_code = 422
    code = "invalid_request"


class AIUnavailableError(AppError):
    """The provider could not be reached or kept failing after retries."""

    status_code = 503
    code = "ai_unavailable"


class AINotConfiguredError(AppError):
    """Provider rejected our credentials, or no credentials are configured."""

    status_code = 503
    code = "ai_not_configured"


class AICancelledError(AppError):
    """The student stopped the generation."""

    status_code = 409
    code = "ai_cancelled"


class AIOutputError(AppError):
    """The model kept returning output that failed validation."""

    status_code = 502
    code = "ai_invalid_output"
