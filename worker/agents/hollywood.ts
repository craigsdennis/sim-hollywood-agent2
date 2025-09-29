import { Agent, callable, getAgentByName } from "agents";
import { stripIndents } from "common-tags";
import { z } from "zod";

export const UI_ELEMENTS = [
  "title",
  "description",
  "genre",
  "tagline",
  "cast",
  "reviews",
  "posterUrl",
  "grittyScale",
] as const;
export type UIElement = (typeof UI_ELEMENTS)[number];

export type Review = {
  rating: number;
  text: string;
  author: string;
};

export type CastMember = {
  character: string;
  actor: string;
};

export type HollywoodAgentState = {
  movieTitle: string;
  description?: string;
  slug?: string;
  genre?: string;
  tagline?: string;
  director?: string;
  posterUrl?: string;
  grittyScale?: number;
  cast: CastMember[];
  reviews: Review[];
  lockedInputs: UIElement[];
  loadingInputs: UIElement[];
};

export class HollywoodAgent extends Agent<Env, HollywoodAgentState> {
  initialState: HollywoodAgentState = {
    movieTitle: "Unnamed",
    cast: [],
    reviews: [],
    lockedInputs: [],
    loadingInputs: [],
  };

  @callable()
  async regenerate(movieTitle: string) {
    this.setState({
      ...this.state,
      movieTitle,
    });
    this.lock("title");

    // Set all unlocked elements to loading at the start
    if (!this.isLocked("grittyScale")) {
      this.setLoading("grittyScale", true);
    }
    if (!this.isLocked("description")) {
      this.setLoading("description", true);
    }
    if (!this.isLocked("tagline")) {
      this.setLoading("tagline", true);
    }
    if (!this.isLocked("cast")) {
      this.setLoading("cast", true);
    }
    if (!this.isLocked("posterUrl")) {
      this.setLoading("posterUrl", true);
    }
    if (!this.isLocked("reviews")) {
      this.setLoading("reviews", true);
    }

    // Generate each element and remove from loading when complete
    if (!this.isLocked("grittyScale")) {
      const grittyScale = await this.generateGrittyScale();
      await this.updateGrittyScale(grittyScale);
      this.setLoading("grittyScale", false);
    }
    if (!this.isLocked("description")) {
      const description = await this.generateDescription();
      await this.updateDescription(description);
      this.setLoading("description", false);
    }
    if (!this.isLocked("tagline")) {
      const tagline = await this.generateTagline();
      await this.updateTagline(tagline);
      this.setLoading("tagline", false);
    }
    if (!this.isLocked("cast")) {
      const cast = await this.generateCast();
      await this.updateCast(cast);
      this.setLoading("cast", false);
    }
    if (!this.isLocked("posterUrl")) {
      const posterUrl = await this.generatePoster();
      await this.updatePosterUrl(posterUrl);
      this.setLoading("posterUrl", false);
    }
    if (!this.isLocked("reviews")) {
      const reviews = await this.generateReviews();
      await this.updateReviews(reviews);
      this.setLoading("reviews", false);
    }
  }

  async generateGrittyScale(): Promise<number> {
    const instructions = stripIndents`You are a movie analyst who determines the "gritty scale" of movies.

    The gritty scale ranges from 1 to 5:
    - 1: Family-friendly, lighthearted, no violence or dark themes (Disney/Pixar style)
    - 2: Light drama, mild themes, minimal violence (PG/PG-13 feel-good movies)
    - 3: Moderate drama, some violence or darker themes (typical Hollywood blockbusters)
    - 4: Dark themes, significant violence, mature content (R-rated dramas/thrillers)
    - 5: Extremely gritty, brutal violence, very dark themes (noir, horror, ultra-violent films)

    Based on the movie title provided, determine the appropriate gritty scale number (1-5).

    Return ONLY the number, nothing else.`;

    const result = await this.env.AI.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: `Movie Title: "${this.state.movieTitle}"` },
        ],
        max_tokens: 300,
      }
    );
    console.log({result});
    const grittyScale = parseInt(result.response);

    // Validate and clamp between 1-5
    if (isNaN(grittyScale) || grittyScale < 1 || grittyScale > 5) {
      return 3; // Default to moderate gritty scale
    }

    return grittyScale;
  }

  async generateDescription() {
    let instructions = stripIndents`You are a script writer who is pitching a new movie.

    The user is going to provide you with details about the movie.
    
    Your job is to use the provided information to create the plot and brief description for the movie to make it a sure sale to Hollywood.
    
    Return only the description.
    `;
    const reporterAgent = await getAgentByName(
      this.env.ReporterAgent,
      "default"
    );
    const trends = await reporterAgent.getPopularTrends();
    if (trends.length > 0) {
      instructions += `Consider leaning into popular movive trends of the time listed below.
      <PopularMovieTrends>
      ${trends.join("\n")}
      </PopularMovieTrends>.

      Ensure to include the trend in the description, to help sell it.
      `;
    }

    let info = `<Title>\n${this.state.movieTitle}\n</Title>`;
    if (this.state.grittyScale) {
      const grittyDescriptions = [
        "family-friendly and lighthearted",
        "light drama with mild themes",
        "moderate drama with some intensity",
        "dark and mature with significant intensity",
        "extremely gritty and brutal"
      ];
      info += `\n<GrittyScale>\n${this.state.grittyScale}/5 - Make this ${grittyDescriptions[this.state.grittyScale - 1]}\n</GrittyScale>`;
    }
    if (this.state.cast.length > 0) {
      info += `\n<Starring>\n${this.state.cast.map(
        (m) => m.actor + " as " + m.character
      )}(", ")}\n</Starring>`;
    }
    if (this.state.tagline) {
      info += `\n<Tagline>\n${this.state.tagline}\n</Tagline>`;
    }
    const results = await this.env.AI.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: info },
        ],
        max_tokens: 10000,
      }
    );
    return results.response;
  }

  async generateTagline() {
    const instructions = stripIndents`You are a marketer who is trying to create catchy taglines for movies.

    The user is going to provide you with details about the movie.
    
    Your job is to use the provided information to create a tagline that can go on billboards.
    
    Return only the tagline. Do not put it in quotes.
    `;
    let info = `<Title>\n${this.state.movieTitle}\n</Title>`;
    if (this.state.description) {
      info += `\n<Description>\n${this.state.description}\n</Description>`;
    }
    const results = await this.env.AI.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: info },
        ],
      }
    );
    return results.response;
  }

  async generateCast(): Promise<CastMember[]> {
    const instructions = stripIndents`You are a Hollywood casting agent.
    
    Your job is to create characters based on a brief as well as choose who you think would make the best casting decision.

    The user is going to provide you information about the movie, and you should be as creative as possible in your decisions.

    It is important to have a diverse cast and to try and typecast actors as much as possible.
    `;

    let info = stripIndents`The movie is titled "${this.state.movieTitle}" and a brief description is as follows:
    <Description>
    ${this.state.description}
    </Description>
    
    Feel free to add additional characters and actors if you think it will help at the box office.
    `;
    // Gather popular actors
    const reporterAgent = await getAgentByName(
      this.env.ReporterAgent,
      "default"
    );
    const actors = await reporterAgent.getPopularActors();
    if (actors.length > 0) {
      info += stripIndents`Here are some currently popular actors, try to choose from these where it makes sense.
      <PopularActors>
        ${actors.join("\n")}
      </PopularActors>
      `;
    }
    const CastSchema = z.array(
      z.object({
        character: z
          .string()
          .meta({ description: "The scripted name of the character in the movie" }),
        actor: z
          .string()
          .meta({ description: "The suggested actor to play this character" }),
      })
    );
    const schema = z.toJSONSchema(CastSchema);
    console.log({schema: JSON.stringify(schema)});
    const result = await this.env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: info },
        ],
        max_tokens: 20000,
        response_format: {
          type: "json_schema",
          json_schema: z.toJSONSchema(CastSchema),
        },
      }
    );
    return result.response as CastMember[];
  }

  // For prompts
  currentStateAsText() {}

  async generatePosterPrompt() {
    const instructions = stripIndents`You are a Prompt Engineer.

    The user is going to provide you information about a movie.

    Your job is to create the perfect Flux Schnell prompt that will generate a poster for their movie.

    Return only the prompt.
    `;

    let info = `The movie is titled "${this.state.movieTitle}" and a brief description is as follows:
    <Description>
    ${this.state.description}
    </Description>
    `;
    if (this.state.grittyScale) {
      const grittyStyles = [
        "colorful, bright, family-friendly Disney-style poster",
        "clean, professional, mainstream movie poster with mild drama",
        "dramatic lighting, typical Hollywood blockbuster poster style",
        "dark, moody, intense poster with dramatic shadows and mature themes",
        "extremely dark, gritty, noir-style poster with harsh lighting and brutal atmosphere"
      ];
      info += `\n<VisualStyle>\nCreate a ${grittyStyles[this.state.grittyScale - 1]} (Gritty Scale: ${this.state.grittyScale}/5)\n</VisualStyle>`;
    }
    if (this.state.cast.length > 0) {
      info += `\n<Starring>\n${this.state.cast.map(
        (m) => m.actor + " as " + m.character
      )}(", ")}\n</Starring>`;
    }
    if (this.state.tagline) {
      info += `\n<Tagline>\n${this.state.tagline}\n</Tagline>`;
    }
    const results = await this.env.AI.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: info },
        ],
      }
    );
    const prompt = results.response;
    return prompt;
  }

  async generatePoster() {
    const prompt = await this.generatePosterPrompt();
    console.log("Creating poster with prompt", prompt);
    const response = await this.env.AI.run(
      "@cf/black-forest-labs/flux-1-schnell",
      {
        prompt,
      }
    );
    const imageResponse = await fetch(
      `data:image/jpeg;charset=utf-8;base64,${response.image}`
    );
    const fileName = `${this.state.slug}/${crypto.randomUUID()}.jpg`;
    await this.env.MOVIE_POSTERS.put(fileName, imageResponse.body);
    return `/images/posters/${fileName}`;
  }

  async generateReviews(): Promise<Review[]> {
    const instructions = stripIndents`You are a synthetic data generator for movie reviews.
    
    Your job is to create realistic sounding reviews for movies.

    The user is going to provide you information about the movie, and you will create a realistic sounding Review as well as the name of the Review.

    Your reviewer names and ratings should attempt to be unique, but cheekily aligned with their review style.

    Create three different reviews with different ratings.

    Ensure the sentiment of the review is part of the rating.
    `;

    let info = `The movie is titled "${this.state.movieTitle}" and a brief description is as follows:
    <Description>
    ${this.state.description}
    </Description>
    `;
    if (this.state.cast.length > 0) {
      info += `\n<Starring>\n${this.state.cast.map(
        (m) => m.actor + " as " + m.character
      )}(", ")}\n</Starring>`;
    }
    if (this.state.tagline) {
      info += `\n<Tagline>\n${this.state.tagline}\n</Tagline>`;
    }

    const ReviewSchema = z.array(
      z.object({
        author: z
          .string()
          .meta({ description: "The full name of the reviewer" }),
        text: z
          .string()
          .meta({ description: "The review text that the reviewer wrote" }),
        rating: z.number().min(1).max(5).meta({
          description: "The number of stars given. Whole numbers only",
        }),
      })
    );

    const { response } = await this.env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: info },
        ],
        max_tokens: 10000,
        response_format: {
          type: "json_schema",
          json_schema: z.toJSONSchema(ReviewSchema),
        },
      }
    );
    console.log({ response });
    return response as Review[];
  }

  isLocked(input: UIElement) {
    return this.state.lockedInputs.includes(input);
  }

  isLoading(input: UIElement) {
    return this.state.loadingInputs.includes(input);
  }

  setLoading(input: UIElement, loading: boolean) {
    const { loadingInputs } = this.state;
    if (loading && !loadingInputs.includes(input)) {
      loadingInputs.push(input);
    } else if (!loading) {
      const index = loadingInputs.indexOf(input);
      if (index > -1) {
        loadingInputs.splice(index, 1);
      }
    }
    this.setState({
      ...this.state,
      loadingInputs: [...loadingInputs],
    });
  }

  @callable()
  async lock(input: UIElement) {
    const { lockedInputs } = this.state;
    lockedInputs.push(input);
    this.setState({
      ...this.state,
      lockedInputs,
    });
  }

  @callable()
  async unlock(input: UIElement) {
    const { lockedInputs } = this.state;
    const removed = lockedInputs.filter((name) => input !== name);
    this.setState({
      ...this.state,
      lockedInputs: removed,
    });
  }

  @callable()
  async updatePosterUrl(posterUrl: string) {
    this.setState({
      ...this.state,
      posterUrl,
    });
    await this.lock("posterUrl");
  }

  @callable()
  async updateDescription(description: string) {
    this.setState({
      ...this.state,
      description,
    });
    await this.lock("description");
  }

  @callable()
  async updateTagline(tagline: string) {
    this.setState({
      ...this.state,
      tagline,
    });
    await this.lock("tagline");
  }

  @callable()
  async updateCast(cast: CastMember[]) {
    this.setState({
      ...this.state,
      cast,
    });
    await this.lock("cast");
  }

  @callable()
  async updateReviews(reviews: Review[]) {
    this.setState({
      ...this.state,
      reviews,
    });
    await this.lock("reviews");
  }

  @callable()
  async updateGrittyScale(grittyScale: number) {
    this.setState({
      ...this.state,
      grittyScale,
    });
    await this.lock("grittyScale");
  }
}
