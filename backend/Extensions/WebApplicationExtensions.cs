using System.Net;

namespace SpinTrackerBackend.Extensions;

public static class WebApplicationExtensions
{
    public static WebApplication UseSpinTrackerPipeline(this WebApplication app)
    {
        app.UseCors();

        app.Use(async (context, next) =>
        {
            try
            {
                await next(context);
            }
            catch (Exception ex)
            {
                app.Logger.LogError("Unhandled exception: {Message}\n{StackTrace}", ex.Message, ex.StackTrace);
                context.Response.StatusCode = (int)HttpStatusCode.InternalServerError;
                context.Response.ContentType = "application/json";
                var errorResponse = new { error = "Internal server error", message = ex.Message };
                await context.Response.WriteAsJsonAsync(errorResponse);
            }
        });

        app.MapControllers();
        return app;
    }
}
