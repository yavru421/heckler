namespace Heckler.Frontend.Models
{
    public class JokeModel
    {
        public string Id { get; set; } = "";
        public string Text { get; set; } = "";
        public string Premise { get; set; } = "";
        public int Kills { get; set; }
        public int Bombs { get; set; }
        public double ProbabilityWeight { get; set; } = 1.0;
    }
}
