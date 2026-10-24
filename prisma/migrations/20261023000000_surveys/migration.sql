-- Encuestas configurables por propietarios y respuestas versionadas.
CREATE TYPE public.survey_question_type AS ENUM ('calificacion', 'opciones', 'texto');
CREATE TYPE public.survey_response_status AS ENUM ('respondida', 'descartada', 'pospuesta');

CREATE TABLE public.surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Encuesta de satisfacción',
  is_active boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT surveys_title_chk CHECK (length(btrim(title)) BETWEEN 1 AND 160),
  CONSTRAINT surveys_owner_key UNIQUE (owner_id)
);

CREATE TABLE public.survey_restaurants (
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON UPDATE CASCADE ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (survey_id, restaurant_id)
);
CREATE INDEX survey_restaurants_restaurant_idx ON public.survey_restaurants (restaurant_id);

CREATE TABLE public.survey_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON UPDATE CASCADE ON DELETE CASCADE,
  prompt text NOT NULL,
  type public.survey_question_type NOT NULL,
  required boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position >= 0),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT survey_questions_prompt_chk CHECK (length(btrim(prompt)) BETWEEN 1 AND 500),
  CONSTRAINT survey_questions_position_key UNIQUE (survey_id, position)
);
CREATE INDEX survey_questions_survey_position_idx ON public.survey_questions (survey_id, position);

CREATE TABLE public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.surveys(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  diner_id uuid NOT NULL REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  survey_version integer NOT NULL CHECK (survey_version > 0),
  status public.survey_response_status NOT NULL DEFAULT 'respondida',
  questions_snapshot jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT survey_responses_order_survey_key UNIQUE (order_id, survey_id)
);
CREATE INDEX survey_responses_restaurant_date_idx ON public.survey_responses (restaurant_id, submitted_at DESC);
CREATE INDEX survey_responses_survey_date_idx ON public.survey_responses (survey_id, submitted_at DESC);

CREATE TABLE public.survey_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES public.survey_responses(id) ON UPDATE CASCADE ON DELETE CASCADE,
  question_id uuid REFERENCES public.survey_questions(id) ON UPDATE CASCADE ON DELETE SET NULL,
  question_prompt text NOT NULL,
  question_type public.survey_question_type NOT NULL,
  options_snapshot jsonb NOT NULL,
  value text NOT NULL,
  CONSTRAINT survey_answers_response_prompt_key UNIQUE (response_id, question_prompt)
);
CREATE INDEX survey_answers_question_idx ON public.survey_answers (question_id);
